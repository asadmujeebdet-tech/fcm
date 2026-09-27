import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { dispatchMessage } from "@/lib/dispatch-message";
import { Message } from "@/types/database";

export const runtime="nodejs";
export const maxDuration=60;

export async function GET(req:NextRequest){
 const authHeader=req.headers.get("authorization");const expected=`Bearer ${process.env.CRON_SECRET}`;
 if(!process.env.CRON_SECRET||authHeader!==expected)return NextResponse.json({error:"Unauthorized"},{status:401});
 try{
  const r=await query<Message>("SELECT * FROM public.messages WHERE status='scheduled' AND scheduled_at <= $1 ORDER BY scheduled_at ASC",[new Date().toISOString()]);
  if(!r.rows.length)return NextResponse.json({dispatched:0});
  for(const message of r.rows)await dispatchMessage(message);
  return NextResponse.json({dispatched:r.rows.length});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Database error"},{status:500});}
}