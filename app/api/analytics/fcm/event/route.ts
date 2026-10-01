import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTransaction } from "@/lib/db";

export const runtime = "nodejs";

const eventSchema = z.object({
  analyticsLabel: z.string().regex(/^[A-Za-z0-9\-_.~%]{1,50}$/),
  targetId: z.string().uuid(),
  installationId: z.string().min(8).max(128),
  event: z.enum(["received", "shown", "opened", "dismissed"]),
  eventTimestamp: z.string().datetime({ offset: true }).optional(),
  appVersion: z.string().max(100).optional(),
  androidVersion: z.string().max(100).optional(),
  deviceModel: z.string().max(150).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: NextRequest) {
  const parsed = eventSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success:false, error:parsed.error.issues[0]?.message ?? "Invalid analytics event." }, { status:400 });
  const input=parsed.data;
  try {
    const result=await withTransaction(async(client)=>{
      const target=await client.query<{id:string;message_id:string;app_id:string|null}>(
        \`SELECT mt.id,mt.message_id,mt.app_id FROM public.message_targets mt
         JOIN public.messages m ON m.id=mt.message_id
         WHERE mt.id=$1 AND m.analytics_label=$2 LIMIT 1\`,
        [input.targetId,input.analyticsLabel]);
      if(!target.rows[0])throw new Error("Analytics target not found.");
      const t=target.rows[0];

      const inserted=await client.query<{id:string}>(
        \`INSERT INTO public.fcm_analytics_events
          (message_id,message_target_id,app_id,analytics_label,installation_id,event_type,event_timestamp,app_version,android_version,device_model,metadata)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (message_target_id,installation_id,event_type) DO NOTHING RETURNING id\`,
        [t.message_id,t.id,t.app_id,input.analyticsLabel,input.installationId,input.event,
         input.eventTimestamp ?? new Date().toISOString(),input.appVersion ?? null,input.androidVersion ?? null,
         input.deviceModel ?? null,input.metadata ? JSON.stringify(input.metadata) : null]);
      if(!inserted.rows[0])return {duplicate:true,event:input.event};

      await client.query(
        \`INSERT INTO public.fcm_analytics_summary(message_target_id,message_id,app_id)
         VALUES($1,$2,$3) ON CONFLICT (message_target_id) DO NOTHING\`,
        [t.id,t.message_id,t.app_id]);

      if(input.event==="received"){
        await client.query(
          \`UPDATE public.fcm_analytics_summary
           SET received_count=received_count+1,delivered_count=delivered_count+1,updated_at=now()
           WHERE message_target_id=$1\`,[t.id]);
      }else{
        const column=({shown:"shown_count",opened:"opened_count",dismissed:"dismissed_count"} as const)[input.event];
        await client.query(
          \`UPDATE public.fcm_analytics_summary SET \${column}=\${column}+1,updated_at=now()
           WHERE message_target_id=$1\`,[t.id]);
      }
      return {duplicate:false,event:input.event};
    });
    return NextResponse.json({success:true,...result});
  }catch(error){
    const message=error instanceof Error?error.message:"Unable to record analytics event.";
    return NextResponse.json({success:false,error:message},{status:message==="Analytics target not found."?404:500});
  }
}
