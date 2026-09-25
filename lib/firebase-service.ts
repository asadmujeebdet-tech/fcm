import * as admin from 'firebase-admin';
import { decrypt } from './encryption';
import type { FirebaseApp, Message } from './types';

const instances=new Map<string,admin.app.App>();
export interface SendResult { appId:string; success:boolean; messageId?:string; error?:string }
function getInstance(app:FirebaseApp){
  const existing=instances.get(app.id);if(existing)return existing;
  const credentials=JSON.parse(decrypt(app.serviceAccountEncrypted));
  const instance=admin.initializeApp({credential:admin.credential.cert(credentials)},'managed-'+app.id);
  instances.set(app.id,instance);return instance;
}
export async function validateApp(credentials:Record<string,unknown>){const temp=admin.initializeApp({credential:admin.credential.cert(credentials as admin.ServiceAccount)},'validate-'+Date.now()+'-'+Math.random());try{await temp.messaging().send({token:'validate_only_invalid_token',notification:{title:'Credential check',body:'Credential check'}},true);return true}catch(error:any){if(error?.code==='messaging/invalid-registration-token'||error?.code==='messaging/registration-token-not-registered')return true;throw new Error('Firebase rejected these credentials. Check service account access and Cloud Messaging API.')}finally{await temp.delete()}}
export async function sendToApp(app:FirebaseApp,message:Message):Promise<SendResult>{try{const target=message.targetType==='token'?{token:message.targetValue||''}:{topic:message.targetValue||'all'};const payload:admin.messaging.Message=message.messageType==='data'?{data:{title:message.title,body:message.body,...message.data},...target}:{notification:{title:message.title,body:message.body,...(message.imageUrl?{imageUrl:message.imageUrl}:{})},...target};const id=await getInstance(app).messaging().send(payload);return {appId:app.id,success:true,messageId:id}}catch(error:any){return {appId:app.id,success:false,error:error?.message||'Firebase send failed'}}}
export async function sendToApps(apps:FirebaseApp[],message:Message,concurrency=5,onResult?:(result:SendResult)=>Promise<void>,beforeSend?:(app:FirebaseApp)=>Promise<void>){const results:SendResult[]=[];let cursor=0;const workers=Array.from({length:Math.min(Math.max(1,Number.isFinite(concurrency)?concurrency:5),apps.length)},async()=>{while(true){const index=cursor++;if(index>=apps.length)return;await beforeSend?.(apps[index]);const result=await sendToApp(apps[index],message);results.push(result);await onResult?.(result)}});await Promise.all(workers);return results}
export async function closeFirebaseInstances(){await Promise.all([...instances.values()].map(instance=>instance.delete().catch(()=>{})));instances.clear()}
export async function forgetFirebaseInstance(appId:string){const instance=instances.get(appId);if(instance){instances.delete(appId);await instance.delete().catch(()=>{})}}
