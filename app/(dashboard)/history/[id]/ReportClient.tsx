"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Ban, Check, Copy } from "lucide-react";
import { Message, MessageTarget } from "@/types/database";
import { AnalyticsView, AxHeader, AxPanel, StatusPill } from "@/components/analytics/AnalyticsView";
import { type AppRow, type Totals, emptyTotals, formatPakistanDay, toTotals } from "@/lib/analytics";

type TargetRow = MessageTarget & { app_name: string | null };

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() { try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch {} }
  return (
    <div className="rounded-xl border border-ax-line bg-white p-3.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ax-soft">{label}</span>
        <button onClick={copy} className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${copied ? "bg-ax-greenSoft text-ax-green" : "text-ax-muted hover:bg-ax-canvas hover:text-ax-navy"}`}>{copied ? <Check size={11} /> : <Copy size={11} />}{copied ? "Copied" : "Copy"}</button>
      </div>
      <p className="whitespace-pre-wrap break-words text-sm leading-6 text-ax-ink">{value || "—"}</p>
    </div>
  );
}

export function ReportClient({ id }: { id: string }) {
  const [message, setMessage] = useState<Message | null>(null);
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [data, setData] = useState<{ totals: Totals; apps: AppRow[] } | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [m, a] = await Promise.all([
        fetch(`/api/messages/${id}`, { cache: "no-store" }),
        fetch(`/api/messages/${id}/analytics`, { cache: "no-store" }),
      ]);
      if (m.status === 404 || a.status === 404) { setNotFound(true); return; }
      const md = await m.json(); const ad = await a.json();
      if (!m.ok) throw new Error(md?.error ?? "Failed to load campaign");
      if (!a.ok) throw new Error(ad?.error ?? "Failed to load analytics");
      setMessage(md.message); setTargets(md.targets ?? []);
      setData({
        totals: toTotals(ad),
        apps: (ad.apps ?? []).map((x: Record<string, unknown>) => ({ id: String(x.target_id), name: String(x.app_name ?? "Deleted app"), icon: (x.app_icon_url as string | null) ?? null, ...toTotals(x as never) })),
      });
      setError(null); setLastFetched(new Date());
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load campaign"); }
  }, [id]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { const t = setInterval(() => { if (!document.hidden) refresh(); }, 3000); return () => clearInterval(t); }, [refresh]);

  async function cancel() {
    if (!confirm("Cancel this scheduled message?")) return;
    await fetch(`/api/messages/${id}`, { method: "DELETE" });
    refresh();
  }

  if (notFound) return (
    <AxPanel><AxHeader title="Campaign Report" backHref="/history" lastFetched={null} />
      <div className="px-6 py-16 text-center"><p className="text-sm font-medium text-ax-navy">Campaign not found</p><p className="mt-1 text-sm text-ax-muted">It may have been deleted.</p><Link href="/history" className="mt-4 inline-block text-sm font-medium text-ax-blue hover:underline">Back to History</Link></div>
    </AxPanel>
  );

  const appCount = targets.length || message?.total_apps_targeted || 0;
  const when = message ? (message.sent_at ?? message.scheduled_at ?? message.created_at) : null;
  const failedTargets = targets.filter((t) => t.status === "failed" && t.error_message);
  const cancellable = message && ["draft", "scheduled"].includes(message.status);

  return (
    <AxPanel>
      <AxHeader title="Campaign Report" backHref="/history" lastFetched={lastFetched}
        actions={cancellable ? <button onClick={cancel} className="flex items-center gap-1.5 rounded-lg border border-ax-red/25 px-2.5 py-1.5 text-xs font-medium text-ax-red transition-colors hover:bg-ax-redSoft"><Ban size={12} /> Cancel</button> : undefined} />
      {error && <p className="mx-5 mt-4 rounded-lg border border-ax-red/20 bg-ax-redSoft px-3 py-2 text-xs text-ax-red sm:mx-6">{error}</p>}
      <AnalyticsView
        loading={!data}
        heading={message?.notification_title || (message ? "Untitled broadcast" : "Loading…")}
        subheading={message ? `${formatPakistanDay(when)} • ${appCount} App${appCount === 1 ? "" : "s"}` : undefined}
        aside={message ? <StatusPill status={message.status} /> : undefined}
        totals={data?.totals ?? emptyTotals} apps={data?.apps ?? []}>
        {message && (
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <CopyField label="Title" value={message.notification_title ?? ""} />
            <CopyField label="Body" value={message.notification_body ?? ""} />
          </div>
        )}
        {failedTargets.length > 0 && (
          <div className="mt-4 rounded-xl border border-ax-red/20 bg-ax-redSoft p-3.5">
            <p className="text-xs font-semibold text-ax-red">Delivery issues</p>
            <ul className="mt-1.5 space-y-1">{failedTargets.map((t) => <li key={t.id} className="text-xs text-ax-ink"><b>{t.app_name ?? "Unknown app"}:</b> {t.error_message}</li>)}</ul>
          </div>
        )}
      </AnalyticsView>
    </AxPanel>
  );
}
