"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Message } from "@/types/database";
import { AxPanel, AxHeader, Pagination, StatusPill, AppAvatar } from "@/components/analytics/AnalyticsView";
import { emptyTotals, fmtNum, formatPakistanDate } from "@/lib/analytics";

const COLS = ["sent", "delivered", "shown", "opened", "dismissed"] as const;

function Apps({ apps }: { apps?: Message["apps"] }) {
  if (!apps?.length) return <span className="text-xs text-ax-soft">—</span>;
  const visible = apps.slice(0, 3);
  return (
    <div className="flex items-center gap-1">
      {visible.map((a) => <AppAvatar key={a.id} name={a.name} icon={a.app_icon_url} size={26} />)}
      {apps.length > visible.length && <span className="ml-1 text-[11px] font-semibold text-ax-muted">+{apps.length - visible.length}</span>}
    </div>
  );
}

export function HistoryClient() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [rows, setRows] = useState<Message[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async (quiet = false) => {
    const id = ++requestId.current;
    if (!quiet) setLoading(true);
    try {
      const res = await fetch(`/api/messages?page=${page}&pageSize=${pageSize}`, { cache: "no-store" });
      const data = await res.json();
      if (id !== requestId.current) return; // a newer request superseded this one
      if (!res.ok) throw new Error(data?.error ?? "Failed to load history");
      setRows(data.messages ?? []);
      setTotal(data.total ?? 0);
      if (data.page && data.page !== page) setPage(data.page);
      setError(null);
      setLastFetched(new Date());
    } catch (e) {
      if (id === requestId.current) setError(e instanceof Error ? e.message : "Failed to load history");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const timer = setInterval(() => { if (!document.hidden) load(true); }, 5000);
    return () => clearInterval(timer);
  }, [load]);

  const open = (id: string) => router.push(`/history/${id}`);

  return (
    <AxPanel>
      <AxHeader title="History" lastFetched={lastFetched} />
      <div className="px-5 pb-1 pt-5 sm:px-6">
        <h2 className="text-xl font-semibold tracking-tight text-ax-navy">All campaigns</h2>
        <p className="mt-1 text-sm text-ax-muted">Every broadcast — sent, scheduled, or drafted. Select one to open its campaign report.</p>
      </div>
      {error && <p className="mx-5 mt-4 rounded-lg border border-ax-red/20 bg-ax-redSoft px-3 py-2 text-xs text-ax-red sm:mx-6">{error}</p>}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead>
            <tr className="border-y border-ax-line bg-ax-canvas text-xs text-ax-soft">
              <th className="px-5 py-2.5 font-medium sm:pl-6">Campaign</th>
              <th className="px-3 py-2.5 font-medium">Apps</th>
              {COLS.map((c) => <th key={c} className="px-3 py-2.5 text-right font-medium capitalize">{c}</th>)}
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-5 py-2.5 font-medium sm:pr-6">When</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const stats = m.stats ?? emptyTotals;
              return (
                <tr key={m.id} tabIndex={0} onClick={() => open(m.id)} onKeyDown={(e) => { if (e.key === "Enter") open(m.id); }}
                  className="cursor-pointer border-b border-ax-line transition-colors last:border-0 hover:bg-ax-canvas focus-visible:bg-ax-canvas focus-visible:outline-none">
                  <td className="max-w-[300px] px-5 py-3.5 sm:pl-6">
                    <Link href={`/history/${m.id}`} onClick={(e) => e.stopPropagation()} className="block truncate font-semibold text-ax-navy hover:text-ax-blue">{m.notification_title || "Untitled broadcast"}</Link>
                    <p className="mt-0.5 truncate text-xs text-ax-muted">{m.notification_body || "—"}</p>
                  </td>
                  <td className="px-3 py-3.5"><Apps apps={m.apps} /></td>
                  {COLS.map((c) => <td key={c} className={`px-3 py-3.5 text-right tabular-nums ${stats[c] ? "font-medium text-ax-ink" : "text-ax-soft"}`}>{fmtNum(stats[c])}</td>)}
                  <td className="px-3 py-3.5"><StatusPill status={m.status} /></td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-xs text-ax-muted sm:pr-6">{formatPakistanDate(m.scheduled_at ?? m.sent_at ?? m.created_at)}</td>
                </tr>
              );
            })}
            {!loading && rows.length === 0 && <tr><td colSpan={9} className="px-6 py-16 text-center text-sm text-ax-muted">Nothing sent yet. Your broadcast history will show up here once you send or schedule a message.</td></tr>}
            {loading && rows.length === 0 && <tr><td colSpan={9} className="px-6 py-16 text-center text-sm text-ax-soft">Loading…</td></tr>}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
    </AxPanel>
  );
}
