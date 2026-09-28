"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Radio, ArrowUpRight, BarChart3, Send, CheckCheck, TrendingUp, Eye, XCircle, TimerReset, BellRing } from "lucide-react";
import { Card, EmptyState } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/StatusBadge";
import { FirebaseAppPublic, Message, MessageApp } from "@/types/database";

function AppPills({ apps, fallback }: { apps?: MessageApp[]; fallback: number }) {
  if (!apps?.length) return <span className="text-xs text-ink2">{fallback}</span>;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {apps.slice(0, 4).map((app) => (
        <div key={app.id} className="group relative" title={app.name}>
          {app.app_icon_url ? (
            <img src={app.app_icon_url} alt="" className="h-7 w-7 rounded-lg object-cover ring-1 ring-white/10" />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface2 text-[9px] font-bold text-white ring-1 ring-white/10">
              {app.name.slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>
      ))}
      {apps.length > 4 && <span className="ml-1 text-[10px] text-ink2">+{apps.length - 4}</span>}
    </div>
  );
}

export function DashboardClient() {
  const [apps, setApps] = useState<FirebaseAppPublic[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/apps").then(async r => ({ ok:r.ok, data:await r.json() })),
      fetch("/api/messages").then(async r => ({ ok:r.ok, data:await r.json() })),
    ]).then(([a,m]) => {
      if (!a.ok) setApiError(`Apps API: ${a.data?.error ?? "Request failed"}`);
      else if (!m.ok) setApiError(`Messages API: ${m.data?.error ?? "Request failed"}`);
      else { setApps(a.data.apps ?? []); setMessages(m.data.messages ?? []); }
      setLoading(false);
    }).catch(e => { setApiError(e instanceof Error ? e.message : "Failed to load dashboard data"); setLoading(false); });
  }, []);

  const activeApps=apps.filter(a=>a.is_active).length;
  const totalSent=messages.reduce((s,m)=>s+(m.total_sent||m.sent_count||0),0);
  const totalDelivered=messages.reduce((s,m)=>s+(m.delivered||m.total_sent||0),0);
  const totalImpressions=messages.reduce((s,m)=>s+(m.impressions||m.total_sent||0),0);
  const totalOpened=messages.reduce((s,m)=>s+(m.opened||0),0);
  const totalDismissed=messages.reduce((s,m)=>s+(m.dismissed||0),0);
  const totalFailed=messages.reduce((s,m)=>s+(m.delivery_failed||m.total_failed||0),0);
  const scheduledCount=messages.filter(m=>m.status==="scheduled").length;
  const deliveryRate=totalSent+totalFailed===0?0:Math.round((totalDelivered/Math.max(1,totalSent+totalFailed))*100);
  const openRate=totalImpressions===0?0:Math.round((totalOpened/Math.max(1,totalImpressions))*100);
  const dismissRate=totalImpressions===0?0:Math.round((totalDismissed/Math.max(1,totalImpressions))*100);
  const stats=[
    {label:"Connected apps",value:loading?"—":`${activeApps}/${apps.length}`,icon:BarChart3,tone:"signal"},
    {label:"Sent",value:loading?"—":totalSent.toLocaleString(),icon:Send,tone:"wave"},
    {label:"Delivered",value:loading?"—":totalDelivered.toLocaleString(),icon:CheckCheck,tone:"success"},
    {label:"Delivery rate",value:loading?"—":`${deliveryRate}%`,icon:TrendingUp,tone:"signal"},
    {label:"Impressions",value:loading?"—":totalImpressions.toLocaleString(),icon:BellRing,tone:"violet"},
    {label:"Opened",value:loading?"—":totalOpened.toLocaleString(),icon:Eye,tone:"info"},
    {label:"Open rate",value:loading?"—":`${openRate}%`,icon:TrendingUp,tone:"warning"},
    {label:"Dismissed",value:loading?"—":totalDismissed.toLocaleString(),icon:XCircle,tone:"danger"},
    {label:"Dismiss rate",value:loading?"—":`${dismissRate}%`,icon:TimerReset,tone:"muted"},
    {label:"Delivery failed",value:loading?"—":totalFailed.toLocaleString(),icon:XCircle,tone:"danger"},
    {label:"Scheduled",value:loading?"—":scheduledCount,icon:TimerReset,tone:"wave"},
  ];

  return <div className="space-y-8">
    <div className="sticky top-0 z-20 -mx-2 mb-4 border-b border-border bg-ink/90 px-2 pb-4 pt-2 backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><h1 className="text-2xl font-semibold tracking-tight text-white">Broadcast dashboard</h1><p className="mt-1 text-sm text-ink2">Everything you're broadcasting, at a glance.</p></div>
        <Link href="/compose"><Button><Radio size={15}/> New broadcast</Button></Link>
      </div>
    </div>
    {apiError&&<Card className="border border-red-500/30 bg-red-500/10"><div className="p-4 text-sm text-red-300"><p className="font-medium">Database/API error</p><p className="mt-1 font-mono text-xs">{apiError}</p></div></Card>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
      {stats.map(s=>{const Icon=s.icon;const toneStyles:Record<string,string>={signal:"bg-signal/12 text-signal border-signal/25",wave:"bg-wave/12 text-wave border-wave/25",success:"bg-emerald-500/12 text-emerald-300 border-emerald-400/20",violet:"bg-violet-500/12 text-violet-300 border-violet-400/20",info:"bg-sky-500/12 text-sky-300 border-sky-400/20",warning:"bg-amber-500/12 text-amber-300 border-amber-400/20",danger:"bg-red-500/12 text-red-300 border-red-400/20",muted:"bg-slate-500/12 text-slate-300 border-slate-400/20"};return <Card key={s.label} className="overflow-hidden border border-border bg-surface"><div className="flex items-start justify-between gap-4 p-5"><div><p className="text-[11px] uppercase tracking-[0.18em] text-ink2">{s.label}</p><p className="mt-3 font-mono text-2xl font-medium text-white">{s.value}</p></div><div className={`rounded-xl border p-2.5 ${toneStyles[s.tone]}`}><Icon size={18}/></div></div></Card>})}
    </div>
    <div>
      <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-medium text-white">Recent Activity</h2><Link href="/history" className="flex items-center gap-1 text-xs text-ink2 hover:text-signal">View all <ArrowUpRight size={12}/></Link></div>
      {!loading&&messages.length===0?<EmptyState title="No broadcasts yet" description="Once you send or schedule your first message, it'll show up here with live delivery status." action={<Link href="/compose"><Button size="sm">Send your first broadcast</Button></Link>}/>:<Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead><tr className="border-b border-border text-xs text-ink2"><th className="px-5 py-3 font-normal">Message</th><th className="px-5 py-3 font-normal">Apps</th><th className="px-5 py-3 font-normal">Status</th><th className="px-5 py-3 font-normal">When</th></tr></thead><tbody>{messages.slice(0,6).map(m=><tr key={m.id} className="border-b border-border last:border-0"><td className="max-w-[360px] truncate px-5 py-3 text-white">{m.notification_title}</td><td className="px-5 py-3"><AppPills apps={m.apps} fallback={m.total_apps_targeted}/></td><td className="px-5 py-3"><StatusBadge status={m.status}/></td><td className="whitespace-nowrap px-5 py-3 text-xs text-ink2">{format(new Date(m.sent_at??m.scheduled_at??m.created_at),"MMM d, HH:mm")}</td></tr>)}</tbody></table></div></Card>}
    </div>
  </div>;
}