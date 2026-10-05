"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Send, CheckCircle2, Eye, MousePointerClick, BellOff } from "lucide-react";
import { type AppRow, type Totals, fmtNum, fmtPct, rates, timeAgo } from "@/lib/analytics";

/* ------------------------------------------------------------------ shell */

export function AxPanel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`analytics-panel w-full overflow-hidden rounded-2xl border border-ax-line bg-white text-ax-ink shadow-[0_24px_60px_-24px_rgba(0,0,0,.65)] ${className}`}
    >
      {children}
    </div>
  );
}

export function LiveBadge({ lastFetched }: { lastFetched: Date | null }) {
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 5000); return () => clearInterval(id); }, []);
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-ax-green/20 bg-ax-greenSoft px-2.5 py-1 text-[11px] font-bold tracking-wide text-ax-green">
        <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping2 rounded-full bg-ax-green" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-ax-green" /></span>
        LIVE
      </span>
      <span className="hidden text-[11px] text-ax-soft sm:inline">Updated {timeAgo(lastFetched)}</span>
    </div>
  );
}

export function AxHeader({ title, backHref, lastFetched, actions }: { title: string; backHref?: string; lastFetched: Date | null; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ax-line px-5 py-3.5 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        {backHref && <Link href={backHref} aria-label="Back" className="-ml-1.5 flex h-8 w-8 items-center justify-center rounded-lg text-ax-navy transition-colors hover:bg-ax-canvas"><ArrowLeft size={17} /></Link>}
        <h1 className="truncate text-[15px] font-semibold text-ax-navy">{title}</h1>
      </div>
      <div className="flex items-center gap-3">{actions}<LiveBadge lastFetched={lastFetched} /></div>
    </div>
  );
}

/* ----------------------------------------------------------------- pieces */

const STATS = [
  { key: "sent", label: "Sent", icon: Send, chip: "bg-ax-blueSoft text-ax-blue" },
  { key: "delivered", label: "Delivered", icon: CheckCircle2, chip: "bg-ax-greenSoft text-ax-green" },
  { key: "shown", label: "Shown", icon: Eye, chip: "bg-ax-purpleSoft text-ax-purple" },
  { key: "opened", label: "Opened", icon: MousePointerClick, chip: "bg-ax-orangeSoft text-ax-orange" },
  { key: "dismissed", label: "Dismissed", icon: BellOff, chip: "bg-ax-redSoft text-ax-red" },
] as const;

function StatCards({ totals, loading }: { totals: Totals; loading: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {STATS.map(({ key, label, icon: Icon, chip }) => (
        <div key={key} className="rounded-xl border border-ax-line bg-white p-4 shadow-[0_1px_2px_rgba(15,27,61,.04)]">
          <span className={`flex h-10 w-10 items-center justify-center rounded-full ${chip}`}><Icon size={18} strokeWidth={2.2} /></span>
          <p className="mt-3 text-[26px] font-semibold leading-none tracking-tight text-ax-navy tabular-nums">{loading ? "—" : fmtNum(totals[key])}</p>
          <p className="mt-1.5 text-sm text-ax-muted">{label}</p>
        </div>
      ))}
    </div>
  );
}

const ARROW = 16;
const clipFirst = `polygon(0 0,calc(100% - ${ARROW}px) 0,100% 50%,calc(100% - ${ARROW}px) 100%,0 100%)`;
const clipMid = `polygon(0 0,calc(100% - ${ARROW}px) 0,100% 50%,calc(100% - ${ARROW}px) 100%,0 100%,${ARROW}px 50%)`;
const clipLast = `polygon(0 0,100% 0,100% 100%,0 100%,${ARROW}px 50%)`;

function Funnel({ totals, loading }: { totals: Totals; loading: boolean }) {
  const r = rates(totals);
  const value = (n: number) => (loading ? "—" : fmtNum(n));
  const rate = (v: number | null) => (loading ? "—" : fmtPct(v));
  const rateCls = "flex flex-[0.8] flex-col justify-center bg-[#f1f5fc] py-3 pl-9 pr-7 text-ax-navy -ml-3";
  return (
    <div>
      <div className="overflow-x-auto">
        <div className="flex min-w-[640px] text-white">
          <div className="flex flex-[1.2] flex-col justify-center rounded-l-xl bg-gradient-to-r from-[#2f6df6] to-[#3b9bff] py-3 pl-5 pr-8" style={{ clipPath: clipFirst }}>
            <span className="text-[22px] font-semibold leading-tight tabular-nums">{value(totals.sent)}</span><span className="text-[13px] opacity-90">Sent</span>
          </div>
          <div className={rateCls} style={{ clipPath: clipMid }}><span className="text-[17px] font-semibold leading-tight tabular-nums">{rate(r.delivery)}</span><span className="text-xs text-ax-muted">Delivery Rate</span></div>
          <div className="-ml-3 flex flex-[1.2] flex-col justify-center bg-gradient-to-r from-[#16b364] to-[#34d399] py-3 pl-9 pr-8" style={{ clipPath: clipMid }}>
            <span className="text-[22px] font-semibold leading-tight tabular-nums">{value(totals.delivered)}</span><span className="text-[13px] opacity-90">Delivered</span>
          </div>
          <div className={rateCls} style={{ clipPath: clipMid }}><span className="text-[17px] font-semibold leading-tight tabular-nums">{rate(r.show)}</span><span className="text-xs text-ax-muted">Show Rate</span></div>
          <div className="-ml-3 flex flex-[1.2] flex-col justify-center rounded-r-xl bg-gradient-to-r from-[#7c5cf5] to-[#9b8cff] py-3 pl-9 pr-5" style={{ clipPath: clipLast }}>
            <span className="text-[22px] font-semibold leading-tight tabular-nums">{value(totals.shown)}</span><span className="text-[13px] opacity-90">Shown</span>
          </div>
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-4 text-ax-soft">Sent = apps accepted by FCM. Delivered, Shown, Opened and Dismissed are reported live by your Android apps.</p>
    </div>
  );
}

export function AppAvatar({ name, icon, size = 28 }: { name: string; icon: string | null; size?: number }) {
  const style = { width: size, height: size };
  return icon
    ? <img src={icon} alt="" title={name} style={style} className="shrink-0 rounded-lg object-cover ring-1 ring-ax-line" />
    : <span title={name} style={style} className="flex shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-ax-blue to-[#3b9bff] text-[11px] font-bold text-white">{name.slice(0, 1).toUpperCase()}</span>;
}

function PerformanceTable({ apps, loading }: { apps: AppRow[]; loading: boolean }) {
  const cols: Array<keyof Totals> = ["sent", "delivered", "shown", "opened", "dismissed"];
  return (
    <div className="min-w-0 rounded-xl border border-ax-line bg-white shadow-[0_1px_2px_rgba(15,27,61,.04)]">
      <h3 className="px-4 pb-1 pt-4 text-sm font-semibold text-ax-navy">Performance by App</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[460px] text-sm">
          <thead>
            <tr className="text-xs text-ax-soft">
              <th className="px-4 py-2.5 text-left font-medium">App</th>
              {cols.map((c) => <th key={c} className="px-3 py-2.5 text-right font-medium capitalize">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {apps.map((a) => (
              <tr key={a.id} className="border-t border-ax-line">
                <td className="px-4 py-3"><div className="flex min-w-0 items-center gap-2.5"><AppAvatar name={a.name} icon={a.icon} size={26} /><span className="truncate text-[13px] font-medium text-ax-ink">{a.name}</span></div></td>
                {cols.map((c) => <td key={c} className="px-3 py-3 text-right tabular-nums text-ax-ink">{fmtNum(a[c])}</td>)}
              </tr>
            ))}
            {!apps.length && <tr className="border-t border-ax-line"><td colSpan={6} className="px-4 py-8 text-center text-sm text-ax-soft">{loading ? "Loading…" : "No app activity yet."}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OpenDonut({ totals }: { totals: Totals }) {
  const r = rates(totals);
  const R = 52, C = 2 * Math.PI * R;
  const base = Math.max(totals.shown, totals.opened + totals.dismissed);
  const has = base > 0;
  const openLen = has ? C * (totals.opened / base) : 0;
  const disLen = has ? C * (totals.dismissed / base) : 0;
  const share = (n: number) => (has ? fmtPct((n / base) * 100) : "—");
  return (
    <div className="rounded-xl border border-ax-line bg-white p-4 shadow-[0_1px_2px_rgba(15,27,61,.04)]">
      <h3 className="text-sm font-semibold text-ax-navy">Open Rate</h3>
      <div className="mt-3 flex items-center justify-center gap-5">
        <div className="relative h-[136px] w-[136px] shrink-0">
          <svg viewBox="0 0 136 136" className="h-full w-full -rotate-90" aria-hidden="true">
            <circle cx="68" cy="68" r={R} fill="none" stroke="#eef2fa" strokeWidth="16" />
            {has && <circle cx="68" cy="68" r={R} fill="none" stroke="#ef4466" strokeWidth="16" strokeDasharray={`${disLen} ${C - disLen}`} strokeDashoffset={-openLen} />}
            {has && <circle cx="68" cy="68" r={R} fill="none" stroke="#16b364" strokeWidth="16" strokeDasharray={`${openLen} ${C - openLen}`} />}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-xl font-semibold text-ax-navy tabular-nums">{fmtPct(r.open)}</span><span className="text-[11px] text-ax-muted">Open Rate</span></div>
        </div>
        <ul className="space-y-3 text-sm">
          <li><span className="flex items-center gap-2 font-medium text-ax-ink"><i className="h-2 w-2 rounded-full bg-ax-green" />Opened</span><span className="ml-4 text-xs text-ax-muted">{share(totals.opened)}</span></li>
          <li><span className="flex items-center gap-2 font-medium text-ax-ink"><i className="h-2 w-2 rounded-full bg-ax-red" />Dismissed</span><span className="ml-4 text-xs text-ax-muted">{share(totals.dismissed)}</span></li>
        </ul>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ composition */

export function AnalyticsView({ heading, subheading, aside, totals, apps, loading = false, children }: {
  heading: ReactNode; subheading?: ReactNode; aside?: ReactNode; totals: Totals; apps: AppRow[]; loading?: boolean; children?: ReactNode;
}) {
  return (
    <div className="px-5 pb-6 pt-5 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0"><h2 className="break-words text-xl font-semibold tracking-tight text-ax-navy">{heading}</h2>{subheading && <p className="mt-1 text-sm text-ax-muted">{subheading}</p>}</div>
        {aside}
      </div>
      <div className="mt-5"><StatCards totals={totals} loading={loading} /></div>
      <div className="mt-5"><Funnel totals={totals} loading={loading} /></div>
      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]"><PerformanceTable apps={apps} loading={loading} /><OpenDonut totals={totals} /></div>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------ small bits */

const PILL: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-slate-100 text-slate-600" },
  scheduled: { label: "Scheduled", cls: "bg-ax-blueSoft text-ax-blue" },
  sending: { label: "Sending", cls: "bg-ax-blueSoft text-ax-blue" },
  sent: { label: "Sent", cls: "bg-ax-greenSoft text-ax-green" },
  partial_failure: { label: "Partial failure", cls: "bg-ax-orangeSoft text-ax-orange" },
  failed: { label: "Failed", cls: "bg-ax-redSoft text-ax-red" },
  canceled: { label: "Canceled", cls: "bg-slate-100 text-slate-500" },
};

export function StatusPill({ status }: { status: string }) {
  const p = PILL[status] ?? { label: status, cls: "bg-slate-100 text-slate-600" };
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${p.cls}`}>{p.label}</span>;
}

export function Pagination({ page, pageSize, total, onPage, onPageSize }: { page: number; pageSize: number; total: number; onPage: (p: number) => void; onPageSize: (n: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const items: Array<number | "…"> = [];
  const add = (v: number | "…") => { if (items[items.length - 1] !== v) items.push(v); };
  for (let p = 1; p <= pages; p++) { if (p === 1 || p === pages || Math.abs(p - page) <= 1) add(p); else add("…"); }
  const btn = "flex h-8 min-w-[32px] items-center justify-center rounded-lg border px-2 text-xs font-medium transition-colors";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ax-line px-5 py-3 sm:px-6">
      <div className="flex items-center gap-3 text-xs text-ax-muted">
        <span>Showing <b className="font-semibold text-ax-ink">{from}–{to}</b> of <b className="font-semibold text-ax-ink">{fmtNum(total)}</b></span>
        <label className="flex items-center gap-1.5">Rows
          <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} className="h-8 rounded-lg border border-ax-line bg-white px-1.5 text-xs text-ax-ink outline-none focus:border-ax-blue">
            {[10, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
      <nav className="flex items-center gap-1" aria-label="Pagination">
        <button onClick={() => onPage(page - 1)} disabled={page <= 1} className={`${btn} border-ax-line bg-white text-ax-ink hover:bg-ax-canvas disabled:cursor-not-allowed disabled:opacity-40`}>Prev</button>
        {items.map((it, i) => it === "…"
          ? <span key={"e" + i} className="px-1 text-xs text-ax-soft">…</span>
          : <button key={it} onClick={() => onPage(it)} aria-current={it === page ? "page" : undefined} className={`${btn} ${it === page ? "border-ax-blue bg-ax-blue text-white" : "border-ax-line bg-white text-ax-ink hover:bg-ax-canvas"}`}>{it}</button>)}
        <button onClick={() => onPage(page + 1)} disabled={page >= pages} className={`${btn} border-ax-line bg-white text-ax-ink hover:bg-ax-canvas disabled:cursor-not-allowed disabled:opacity-40`}>Next</button>
      </nav>
    </div>
  );
}
