"use client";

import { useEffect, useState } from "react";
import { X, Ban, Copy, Check } from "lucide-react";
import { Card, EmptyState } from "@/components/ui/Card";
import { StatusBadge } from "@/components/StatusBadge";
import { Message, MessageApp, MessageTarget } from "@/types/database";

type TargetRow = MessageTarget & { firebase_apps: { name:string; app_icon_url?:string|null }|null };

function formatPakistanDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const datePart = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);

  const timePart = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Karachi",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);

  return datePart + " • " + timePart;
}

function AppPills({apps,fallback}:{apps?:MessageApp[];fallback:number}) {
  if(!apps?.length)return <span className="text-xs text-ink2">—</span>;
  const visibleApps = apps.slice(0, 4);
  const remaining = Math.max(0, apps.length - visibleApps.length);
  return (
    <div className="flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap">
      {visibleApps.map(app=>app.app_icon_url
        ? <img key={app.id} src={app.app_icon_url} alt={app.name} title={app.name} className="h-7 w-7 shrink-0 rounded-md object-cover ring-1 ring-border"/>
        : <div key={app.id} title={app.name} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface2 text-[9px] font-bold text-white ring-1 ring-border">{app.name.slice(0,1).toUpperCase()}</div>
      )}
      {remaining > 0 && <span className="ml-1 shrink-0 text-[10px] font-semibold text-ink2">+{remaining}</span>}
    </div>
  );
}

function CopyField({label,value}:{label:string;value:string}) {
 const [copied,setCopied]=useState(false);
 async function copy(){try{await navigator.clipboard.writeText(value);setCopied(true);setTimeout(()=>setCopied(false),1400);}catch{}}
 return <div className="group rounded-xl border border-border bg-surface2/30 p-3 transition-colors hover:border-signal/40 hover:bg-surface2/60"><div className="mb-2 flex items-center justify-between gap-2"><span className="text-[10px] font-semibold uppercase tracking-[.16em] text-ink2">{label}</span><button onClick={copy} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] text-ink2 hover:text-white">{copied?<Check size={11}/>:<Copy size={11}/>} {copied?"Copied":"Copy"}</button></div><p className="whitespace-pre-wrap break-words text-sm leading-6 text-white">{value||"—"}</p></div>;
}

export function HistoryClient(){
 const [messages,setMessages]=useState<Message[]>([]);
 const [loading,setLoading]=useState(true);
 const [selected,setSelected]=useState<Message|null>(null);
 const [targets,setTargets]=useState<TargetRow[]>([]);
 const [loadingTargets,setLoadingTargets]=useState(false);

 async function openDetail(message:Message){
   setSelected(message);
   setLoadingTargets(true);
   const res=await fetch(`/api/messages/${message.id}`);
   const data=await res.json();
   setSelected(data.message??message);
   setTargets(data.targets??[]);
   setLoadingTargets(false);
 }

 async function loadMessages(){
   setLoading(true);
   const res=await fetch("/api/messages");
   const data=await res.json();
   const nextMessages=data.messages??[];
   setMessages(nextMessages);
   setLoading(false);
   if(nextMessages.length>0) await openDetail(nextMessages[0]);
   else setSelected(null);
 }

 useEffect(()=>{loadMessages();},[]);

 async function cancelMessage(message:Message){
   if(!confirm("Cancel this scheduled message?"))return;
   await fetch(`/api/messages/${message.id}`,{method:"DELETE"});
   loadMessages();
   setSelected(null);
 }

 const title=selected?.notification_title??"";
 const body=selected?.notification_body??"";

 return <div className="space-y-6">
   <div><h1 className="text-xl font-semibold text-white">History</h1><p className="mt-1 text-sm text-ink2">Every broadcast — sent, scheduled, or drafted.</p></div>
   <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
    <div className="min-w-0">
     {!loading&&messages.length===0?<EmptyState title="Nothing sent yet" description="Your broadcast history will show up here once you send or schedule a message."/>:<Card className="overflow-hidden"><div className="w-full"><table className="history-table w-full table-fixed text-left text-sm"><thead><tr className="border-b border-border text-xs text-ink2"><th className="w-[31%] px-3 py-3 font-normal sm:px-5">Apps</th><th className="w-[19%] px-3 py-3 text-center font-normal sm:px-5">FCM Accepted / Failed</th><th className="w-[15%] px-3 py-3 text-center font-normal sm:px-5">Status</th><th className="w-[20%] px-3 py-3 font-normal sm:px-5">When</th></tr></thead><tbody>{messages.map(m=><tr key={m.id} onClick={()=>openDetail(m)} className={`cursor-pointer border-b border-border last:border-0 hover:bg-surface2/50 ${selected?.id===m.id?"bg-surface2/40":""}`}><td className="min-w-0 overflow-hidden px-3 py-3 sm:px-5"><AppPills apps={m.apps} fallback={m.total_apps_targeted}/></td><td className="px-3 py-3 text-center font-mono text-[10px] font-medium text-ink2 sm:px-5 sm:text-xs">{m.total_sent} / {m.total_failed}</td><td className="px-3 py-3 text-center sm:px-5"><StatusBadge status={m.status}/></td><td className="px-3 py-3 text-[10px] leading-4 text-ink2 sm:px-5 sm:text-xs">{formatPakistanDate(m.scheduled_at??m.sent_at??m.created_at)}</td></tr>)}</tbody></table></div></Card>}
    </div>
    {selected&&<Card className="h-fit min-w-0 p-5 lg:sticky lg:top-6">
      <div className="mb-5 flex items-start justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[.18em] text-ink2">Message details</p><h2 className="mt-1 text-base font-semibold text-white">Broadcast</h2></div><div className="flex items-center gap-2"><StatusBadge status={selected.status}/><button onClick={()=>setSelected(null)} className="rounded-md p-1 text-ink2 hover:bg-surface2 hover:text-white" aria-label="Close"><X size={15}/></button></div></div>
      <div className="space-y-3">
        <div className="rounded-xl bg-violet-500/10 p-1 transition-colors hover:bg-violet-500/15"><CopyField label="Title" value={title}/></div>
        <div className="rounded-xl bg-sky-500/10 p-1 transition-colors hover:bg-sky-500/15"><CopyField label="Body" value={body}/></div>
      </div>
      <div className="mt-5 border-t border-border pt-4"><div className="mb-3 flex items-center justify-between"><p className="text-xs font-medium text-white">Apps & delivery</p>{["draft","scheduled"].includes(selected.status)&&<button onClick={()=>cancelMessage(selected)} className="flex items-center gap-1 text-xs text-danger hover:underline"><Ban size={11}/> Cancel</button>}</div>
      {loadingTargets?<p className="text-xs text-ink2">Loading...</p>:<div className="space-y-2">{targets.map(t=><div key={t.id} className="rounded-lg border border-border p-3"><div className="flex min-w-0 items-center gap-2">{t.firebase_apps?.app_icon_url?<img src={t.firebase_apps.app_icon_url} alt="" className="h-7 w-7 rounded-md object-cover"/>:<div className="flex h-7 w-7 items-center justify-center rounded-md bg-surface2 text-[9px] text-white">{t.firebase_apps?.name?.slice(0,1).toUpperCase()??"?"}</div>}<span className="truncate text-xs text-white">{t.firebase_apps?.name??"Unknown app"}</span><span className={`ml-auto shrink-0 text-[10px] font-semibold uppercase tracking-wide ${t.status==="failed"?"text-danger":"text-ink2"}`}>{t.status==="sent"?"accepted":t.status}</span></div>{t.error_message&&<p className="mt-1 text-xs text-danger">{t.error_message}</p>}</div>)}</div>}
      </div>
    </Card>}
   </div>
 </div>;
}