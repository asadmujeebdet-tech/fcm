import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";
import { encrypt } from "@/lib/encryption";
import { isValidTopic, normalizeTopic } from "@/lib/fcm-utils";

export const runtime="nodejs";
const createAppSchema=z.object({name:z.string().min(1),topic:z.string().default(""),appIconUrl:z.string().url().or(z.literal("")).optional(),serviceAccount:z.string().min(1),isActive:z.boolean().default(true)});
const publicColumns="id,user_id,name,project_id,app_icon_url,topic,is_active,created_at,updated_at";

export async function GET(){
 try{const r=await query(`SELECT id,user_id,name,project_id,app_icon_url,topic,is_active,created_at,updated_at FROM public.firebase_apps ORDER BY created_at DESC`);return NextResponse.json({apps:r.rows});}
 catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Database error"},{status:500});}
}
export async function POST(req:NextRequest){
 const userId=await getCurrentUserId(); if(!userId)return NextResponse.json({error:"Unauthorized"},{status:401});
 const body=await req.json().catch(()=>null); const parsed=createAppSchema.safeParse(body);
 if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message??"Invalid input"},{status:400});
 const topic=normalizeTopic(parsed.data.topic);
 if(topic&&!isValidTopic(topic))return NextResponse.json({error:"Invalid topic. Topics may only contain letters, numbers and - _ . ~ %"},{status:400});
 let serviceAccountObj:any;
 try{serviceAccountObj=JSON.parse(parsed.data.serviceAccount);}catch{return NextResponse.json({error:"serviceAccount is not valid JSON"},{status:400});}
 const projectId=serviceAccountObj.project_id;
 if(!projectId||!serviceAccountObj.private_key||!serviceAccountObj.client_email)return NextResponse.json({error:"serviceAccount JSON is missing required fields (project_id, private_key, client_email)"},{status:400});
 const {ciphertext,iv,tag}=encrypt(parsed.data.serviceAccount);
 try{
  const r=await query(`INSERT INTO public.firebase_apps (user_id,name,project_id,app_icon_url,topic,is_active,service_account_encrypted,encryption_iv,encryption_tag)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${publicColumns}`,
   [userId,parsed.data.name,projectId,parsed.data.appIconUrl||null,topic,parsed.data.isActive,ciphertext,iv,tag]);
  return NextResponse.json({app:r.rows[0]},{status:201});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Database error"},{status:500});}
}