import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";

export const runtime="nodejs";

function rate(value:number,denominator:number){return denominator>0?Number(((value/denominator)*100).toFixed(2)):null;}

export async function GET(_req:NextRequest,{params}:{params:{id:string}}){
 const userId=await getCurrentUserId();if(!userId)return NextResponse.json({error:"Unauthorized"},{status:401});
 try{
  const message=await query<{id:string;analytics_label:string;total_apps_targeted:number}>(
   \`SELECT id,analytics_label,total_apps_targeted FROM public.messages WHERE id=$1 AND user_id=$2\`,[params.id,userId]);
  if(!message.rows[0])return NextResponse.json({error:"Not found"},{status:404});
  const rows=await query<{
   target_id:string;app_id:string|null;app_name:string|null;app_icon_url:string|null;sent:number;failed:number;
   delivered:number;received:number;shown:number;opened:number;dismissed:number;updated_at:string|null;
  }>(
   \`SELECT mt.id AS target_id,mt.app_id,COALESCE(fa.name,mt.app_name,'Deleted app') AS app_name,fa.app_icon_url,
     CASE WHEN mt.status='sent' THEN 1 ELSE 0 END AS sent,CASE WHEN mt.status='failed' THEN 1 ELSE 0 END AS failed,
     COALESCE(s.delivered_count,0) AS delivered,COALESCE(s.received_count,0) AS received,
     COALESCE(s.shown_count,0) AS shown,COALESCE(s.opened_count,0) AS opened,
     COALESCE(s.dismissed_count,0) AS dismissed,s.updated_at
    FROM public.message_targets mt
    LEFT JOIN public.firebase_apps fa ON fa.id=mt.app_id
    LEFT JOIN public.fcm_analytics_summary s ON s.message_target_id=mt.id
    WHERE mt.message_id=$1 ORDER BY mt.created_at ASC\`,[params.id]);
  const totals=rows.rows.reduce((a,r)=>({
   sent:a.sent+Number(r.sent),failed:a.failed+Number(r.failed),delivered:a.delivered+Number(r.delivered),
   received:a.received+Number(r.received),shown:a.shown+Number(r.shown),opened:a.opened+Number(r.opened),dismissed:a.dismissed+Number(r.dismissed)
  }),{sent:0,failed:0,delivered:0,received:0,shown:0,opened:0,dismissed:0});
  return NextResponse.json({
   success:true,messageId:params.id,analyticsLabel:message.rows[0].analytics_label,...totals,
   deliveryRate:rate(totals.delivered,totals.sent),showRate:rate(totals.shown,totals.delivered),
   openRate:rate(totals.opened,totals.shown),dismissRate:rate(totals.dismissed,totals.shown),
   updatedAt:rows.rows.reduce<string|null>((latest,row)=>{if(!row.updated_at)return latest;if(!latest)return row.updated_at;return new Date(row.updated_at)>new Date(latest)?row.updated_at:latest;},null),
   apps:rows.rows
  });
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Database error"},{status:500});}
}
