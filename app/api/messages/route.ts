import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query, withTransaction } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";
import { dispatchMessage } from "@/lib/dispatch-message";
import type { PoolClient } from "pg";
import { Message } from "@/types/database";

export const runtime = "nodejs";
// Send-now dispatches every selected app inside this request. Give it room on
// hosts that honour it (Vercel); the scheduler covers anything that still dies.
export const maxDuration = 60;
const baseSchema = z.object({
  appIds:z.array(z.string().uuid()).min(1,"Select at least one app"), topic:z.string().default(""),
  action:z.enum(["draft","send_now","schedule"]),
  scheduledAt:z.union([z.string().datetime({ offset: true }),z.array(z.string().datetime({ offset: true }))]).optional(),
  notificationTitle:z.string().optional(), notificationBody:z.string().optional(), notificationImage:z.string().optional(),
});

export async function GET(){
  try{
    const r=await query(`
      SELECT m.*,
        COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
          'id',COALESCE(mt.app_id,mt.id),'name',COALESCE(fa.name,mt.app_name,'Deleted app'),'app_icon_url',fa.app_icon_url
        )) FILTER (WHERE mt.id IS NOT NULL),'[]'::jsonb) AS apps
      FROM public.messages m
      LEFT JOIN public.message_targets mt ON mt.message_id=m.id
      LEFT JOIN public.firebase_apps fa ON fa.id=mt.app_id
      GROUP BY m.id
      ORDER BY m.created_at DESC
    `);
    return NextResponse.json({messages:r.rows});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Database error"},{status:500});}
}

export async function POST(req:NextRequest){
  const userId=await getCurrentUserId(); if(!userId)return NextResponse.json({error:"Unauthorized"},{status:401});
  const parsed=baseSchema.safeParse(await req.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message??"Invalid input"},{status:400});
  const input=parsed.data;
  if(!input.notificationTitle||!input.notificationBody)
    return NextResponse.json({error:"notificationTitle and notificationBody are required"},{status:400});
  const scheduleTimes=Array.isArray(input.scheduledAt)?input.scheduledAt:input.scheduledAt?[input.scheduledAt]:[];
  if(input.action==="schedule"&&!scheduleTimes.length)return NextResponse.json({error:"At least one scheduledAt value is required to schedule a message"},{status:400});

  if(input.action==="schedule"){
    const invalidPakistanTime=scheduleTimes.find((value) => !/[+]05:00$/.test(value));
    if(invalidPakistanTime){
      return NextResponse.json(
        {error:"Scheduled times must use Pakistan Time (PKT, UTC+05:00)."},
        {status:400}
      );
    }
  }
  try{
    const requestedAppIds=[...new Set(input.appIds)];
    const owned=await query<{id:string}>(`SELECT id FROM public.firebase_apps WHERE user_id=$1 AND id=ANY($2::uuid[])`,[userId,requestedAppIds]);
    const ownedIds=new Set(owned.rows.map(a=>a.id));
    const validAppIds=requestedAppIds.filter(id=>ownedIds.has(id));
    // Never broadcast to a silent subset of what the user selected.
    if(validAppIds.length!==requestedAppIds.length){
      const missing=requestedAppIds.filter(id=>!ownedIds.has(id));
      return NextResponse.json({error:`${missing.length} selected app(s) no longer exist or are not available. Refresh the page and select again. Nothing was sent.`,missingAppIds:missing},{status:400});
    }
    // Message row + all target rows are written atomically, so a failure can
    // never leave a broadcast with missing targets.
    const insertMessage=async(client:PoolClient,status:"draft"|"scheduled",scheduledAt:string|null)=>{
      const r=await client.query<Message>(`INSERT INTO public.messages
        (user_id,topic,notification_title,notification_body,notification_image,analytics_label,status,scheduled_at,total_apps_targeted)
        VALUES($1,$2,$3,$4,$5,'msg-' || replace(gen_random_uuid()::text,'-',''),$6,$7,$8) RETURNING *`,[
          userId,input.topic||"",input.notificationTitle||null,input.notificationBody||null,input.notificationImage||null,
          status,scheduledAt,validAppIds.length]);
      const message=r.rows[0]; if(!message)throw new Error("Failed to create message");
      const t=await client.query(`INSERT INTO public.message_targets(message_id,app_id,app_name)
        SELECT $1,fa.id,fa.name FROM public.firebase_apps fa WHERE fa.id=ANY($2::uuid[])`,[message.id,validAppIds]);
      if(t.rowCount!==validAppIds.length)throw new Error("Failed to create all message targets");
      return message;
    };
    if(input.action==="send_now"){
      const message=await withTransaction(client=>insertMessage(client,"draft",null)); await dispatchMessage(message);
      const final=await query<Message>("SELECT * FROM public.messages WHERE id=$1",[message.id]);
      const targets=await query(`SELECT mt.id,mt.app_id,mt.status,mt.fcm_message_id,mt.error_message,mt.sent_at,COALESCE(fa.name,mt.app_name) AS app_name,fa.app_icon_url
        FROM public.message_targets mt LEFT JOIN public.firebase_apps fa ON fa.id=mt.app_id WHERE mt.message_id=$1 ORDER BY mt.created_at ASC`,[message.id]);
      return NextResponse.json({message:final.rows[0]??message,targets:targets.rows},{status:201});
    }
    // All scheduled times succeed or none do.
    const insertedMessages=await withTransaction(async client=>{const rows:Message[]=[];for(const scheduledIso of scheduleTimes)rows.push(await insertMessage(client,"scheduled",scheduledIso));return rows;});
    return NextResponse.json({messages:insertedMessages},{status:201});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Database error"},{status:500});}
}