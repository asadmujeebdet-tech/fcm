import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";
import { dispatchMessage } from "@/lib/dispatch-message";
import { Message } from "@/types/database";

export const runtime = "nodejs";
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
          'id',fa.id,'name',fa.name,'app_icon_url',fa.app_icon_url
        )) FILTER (WHERE fa.id IS NOT NULL),'[]'::jsonb) AS apps
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
    if(!validAppIds.length)return NextResponse.json({error:"None of the selected apps are valid"},{status:400});
    const createMessage=async(status:"draft"|"scheduled",scheduledAt:string|null)=>{
      const r=await query<Message>(`INSERT INTO public.messages
        (user_id,topic,notification_title,notification_body,notification_image,status,scheduled_at,total_apps_targeted)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[
          userId,input.topic||"",input.notificationTitle||null,input.notificationBody||null,input.notificationImage||null,
          status,scheduledAt,validAppIds.length]);
      const message=r.rows[0]; if(!message)throw new Error("Failed to create message");
      await query(`INSERT INTO public.message_targets(message_id,app_id) SELECT $1,unnest($2::uuid[])`,[message.id,validAppIds]);
      return message;
    };
    if(input.action==="send_now"){
      const message=await createMessage("draft",null); await dispatchMessage(message);
      const final=await query<Message>("SELECT * FROM public.messages WHERE id=$1",[message.id]);
      const targets=await query(`SELECT mt.id,mt.app_id,mt.status,mt.fcm_message_id,mt.error_message,mt.sent_at,fa.name AS app_name,fa.app_icon_url
        FROM public.message_targets mt LEFT JOIN public.firebase_apps fa ON fa.id=mt.app_id WHERE mt.message_id=$1 ORDER BY mt.created_at ASC`,[message.id]);
      return NextResponse.json({message:final.rows[0]??message,targets:targets.rows},{status:201});
    }
    const insertedMessages:Message[]=[]; for(const scheduledIso of scheduleTimes)insertedMessages.push(await createMessage("scheduled",scheduledIso));
    return NextResponse.json({messages:insertedMessages},{status:201});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Database error"},{status:500});}
}