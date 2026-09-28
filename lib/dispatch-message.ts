import * as admin from "firebase-admin";
import { query } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { FirebaseApp, Message } from "@/types/database";

function buildFcmMessage(message:Message,topic:string):admin.messaging.Message{
 return{topic,notification:{title:message.notification_title??"",body:message.notification_body??"",...(message.notification_image?{imageUrl:message.notification_image}:{})}};
}

export async function dispatchMessage(message:Message):Promise<void>{
 await query("UPDATE public.messages SET status='sending',updated_at=now() WHERE id=$1",[message.id]);
 const targetsResult=await query<{id:string;app_id:string}>(`SELECT id,app_id FROM public.message_targets WHERE message_id=$1 AND status='pending'`,[message.id]);
 if(!targetsResult.rows.length){await query("UPDATE public.messages SET status='failed',updated_at=now() WHERE id=$1",[message.id]);return;}
 const appIds=targetsResult.rows.map(t=>t.app_id);
 const appsResult=await query<FirebaseApp>("SELECT * FROM public.firebase_apps WHERE id=ANY($1::uuid[])",[appIds]);
 const appsById=new Map(appsResult.rows.map(a=>[a.id,a]));
 let sent=0,failed=0;
 for(const target of targetsResult.rows){
  const app=appsById.get(target.app_id);
  if(!app||!app.is_active){
   failed++;
   await query("UPDATE public.message_targets SET status='failed',error_message=$2 WHERE id=$1",[target.id,!app?"App not found":"App is inactive"]);
   continue;
  }
  const appName=`dispatch-${message.id}-${target.app_id}`;let adminApp:admin.app.App|undefined;
  try{
   const serviceAccount=JSON.parse(decrypt(app.service_account_encrypted,app.encryption_iv,app.encryption_tag));
   adminApp=admin.initializeApp({credential:admin.credential.cert(serviceAccount)},appName);
   const topic=app.topic?.trim();
   const fcmMessageId=await admin.messaging(adminApp).send(buildFcmMessage(message,topic));
   sent++;
   await query("UPDATE public.message_targets SET status='sent',fcm_message_id=$2,sent_at=$3 WHERE id=$1",[target.id,fcmMessageId,new Date().toISOString()]);
  }catch(err:any){
   failed++;
   await query("UPDATE public.message_targets SET status='failed',error_message=$2 WHERE id=$1",[target.id,err?.message??"Unknown error"]);
  }finally{if(adminApp)await adminApp.delete().catch(()=>{});}
 }
 const finalStatus=failed===0?"sent":sent===0?"failed":"partial_failure";
 await query("UPDATE public.messages SET status=$2,sent_at=$3,total_sent=$4,total_failed=$5,updated_at=now() WHERE id=$1",[message.id,finalStatus,new Date().toISOString(),sent,failed]);
}