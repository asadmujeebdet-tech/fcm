import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query, withTransaction } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";
import { isValidTopic, normalizeTopic } from "@/lib/fcm-utils";
export const runtime="nodejs";
const updateAppSchema=z.object({name:z.string().min(1).optional(),topic:z.string().optional(),appIconUrl:z.string().url().or(z.literal("")).optional(),isActive:z.boolean().optional()});
const publicColumns="id,user_id,name,project_id,app_icon_url,topic,is_active,created_at,updated_at";
export async function PATCH(req:NextRequest,{params}:{params:{id:string}}){
 const userId=await getCurrentUserId();if(!userId)return NextResponse.json({error:"Unauthorized"},{status:401});
 const parsed=updateAppSchema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message??"Invalid input"},{status:400});
 const fields:string[]=[];const values:unknown[]=[];const add=(c:string,v:unknown)=>{fields.push(`${c}=$${values.length+1}`);values.push(v);};
 if(parsed.data.name!==undefined)add("name",parsed.data.name);if(parsed.data.topic!==undefined){const topic=normalizeTopic(parsed.data.topic);if(topic&&!isValidTopic(topic))return NextResponse.json({error:"Invalid topic. Topics may only contain letters, numbers and - _ . ~ %"},{status:400});add("topic",topic);}if(parsed.data.appIconUrl!==undefined)add("app_icon_url",parsed.data.appIconUrl||null);if(parsed.data.isActive!==undefined)add("is_active",parsed.data.isActive);
 if(!fields.length)return NextResponse.json({error:"No changes supplied"},{status:400});values.push(params.id,userId);
 try{const r=await query(`UPDATE public.firebase_apps SET ${fields.join(",")},updated_at=now() WHERE id=$${values.length-1} AND user_id=$${values.length} RETURNING ${publicColumns}`,values);if(!r.rows[0])return NextResponse.json({error:"Not found"},{status:404});return NextResponse.json({app:r.rows[0]});}
 catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Database error"},{status:500});}
}
export async function DELETE(_req:NextRequest,{params}:{params:{id:string}}){
 const userId=await getCurrentUserId();if(!userId)return NextResponse.json({error:"Unauthorized"},{status:401});
 try{
   const result=await withTransaction(async client=>{
     const app=await client.query<{id:string}>(`SELECT id FROM public.firebase_apps WHERE id=$1 AND user_id=$2 FOR UPDATE`,[params.id,userId]);
     if(!app.rows[0])return null;

     const affected=await client.query<{message_id:string}>(`
       SELECT DISTINCT message_id
       FROM public.message_targets
       WHERE app_id=$1
     `,[params.id]);

     // Remove only this app's target rows. A multi-app broadcast remains intact
     // for every other app that was part of the same message.
     await client.query(`DELETE FROM public.message_targets WHERE app_id=$1`,[params.id]);
     await client.query(`DELETE FROM public.firebase_apps WHERE id=$1 AND user_id=$2`,[params.id,userId]);

     for(const row of affected.rows){
       const messageId=row.message_id;
       const totals=await client.query<{total_apps_targeted:string;total_sent:string;total_failed:string}>(`
         SELECT
           COUNT(*)::text AS total_apps_targeted,
           COUNT(*) FILTER (WHERE status='sent')::text AS total_sent,
           COUNT(*) FILTER (WHERE status='failed')::text AS total_failed
         FROM public.message_targets
         WHERE message_id=$1
       `,[messageId]);

       const total=totals.rows[0];
       const targeted=Number(total?.total_apps_targeted??0);
       if(targeted===0){
         // If the deleted app was the only target, the broadcast no longer
         // represents a dashboard record and is removed as well.
         await client.query(`DELETE FROM public.messages WHERE id=$1 AND user_id=$2`,[messageId,userId]);
         continue;
       }

       const sent=Number(total?.total_sent??0);
       const failed=Number(total?.total_failed??0);
       const status =
         sent===0 && failed===0 ? "scheduled" :
         failed===0 ? "sent" :
         sent===0 ? "failed" :
         "partial_failure";

       await client.query(`
         UPDATE public.messages
         SET total_apps_targeted=$2,
             total_sent=$3,
             total_failed=$4,
             status=CASE
               WHEN status IN ('draft','scheduled','sending','canceled') THEN status
               ELSE $5
             END,
             updated_at=now()
         WHERE id=$1 AND user_id=$6
       `,[messageId,targeted,sent,failed,status,userId]);
     }

     return {affectedMessages:affected.rowCount??0};
   });

   if(!result)return NextResponse.json({error:"Not found"},{status:404});
   return NextResponse.json({success:true,affectedMessages:result.affectedMessages});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Database error"},{status:500});}
}