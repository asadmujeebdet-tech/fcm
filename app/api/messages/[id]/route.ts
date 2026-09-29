import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";
export const runtime="nodejs";

export async function GET(_req:NextRequest,{params}:{params:{id:string}}){
 const userId=await getCurrentUserId();if(!userId)return NextResponse.json({error:"Unauthorized"},{status:401});
 try{
  const m=await query("SELECT * FROM public.messages WHERE id=$1 AND user_id=$2",[params.id,userId]);const message=m.rows[0];
  if(!message)return NextResponse.json({error:"Not found"},{status:404});
  const t=await query(`SELECT mt.id,mt.app_id,mt.status,mt.fcm_message_id,mt.error_message,mt.sent_at,COALESCE(fa.name,mt.app_name) AS app_name,fa.app_icon_url
    FROM public.message_targets mt LEFT JOIN public.firebase_apps fa ON fa.id=mt.app_id
    WHERE mt.message_id=$1 ORDER BY mt.created_at ASC`,[message.id]);
  return NextResponse.json({message,targets:t.rows.map(row=>({...row,firebase_apps:row.app_name?{name:row.app_name,app_icon_url:row.app_icon_url}:null}))});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Database error"},{status:500});}
}
export async function DELETE(_req:NextRequest,{params}:{params:{id:string}}){
 const userId=await getCurrentUserId();if(!userId)return NextResponse.json({error:"Unauthorized"},{status:401});
 try{
  const m=await query<{id:string;status:string}>("SELECT id,status FROM public.messages WHERE id=$1 AND user_id=$2",[params.id,userId]);const message=m.rows[0];
  if(!message)return NextResponse.json({error:"Not found"},{status:404});
  if(!["draft","scheduled"].includes(message.status))return NextResponse.json({error:"Only draft or scheduled messages can be canceled"},{status:400});
  await query("UPDATE public.messages SET status='canceled',updated_at=now() WHERE id=$1",[params.id]);
  return NextResponse.json({success:true});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Database error"},{status:500});}
}