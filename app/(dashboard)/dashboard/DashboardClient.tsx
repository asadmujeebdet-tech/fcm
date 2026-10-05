"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Radio } from "lucide-react";
import { AnalyticsView, AxHeader, AxPanel } from "@/components/analytics/AnalyticsView";
import { type AppRow, type Totals, emptyTotals } from "@/lib/analytics";

type Overview = { totals: Totals; apps: AppRow[]; campaigns: number; appCount: number };

export function DashboardClient() {
  const [data, setData] = useState<Overview | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/analytics/overview", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to load dashboard data");
      setData(json); setError(null); setLastFetched(new Date());
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load dashboard data"); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(() => { if (!document.hidden) load(); }, 5000); return () => clearInterval(t); }, [load]);

  const n = data?.campaigns ?? 0;
  const apps = data?.appCount ?? 0;
  return (
    <AxPanel>
      <AxHeader title="Dashboard" lastFetched={lastFetched}
        actions={<Link href="/compose" className="flex items-center gap-1.5 rounded-lg bg-ax-blue px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#2559d4]"><Radio size={13} /> New broadcast</Link>} />
      {error && <p className="mx-5 mt-4 rounded-lg border border-ax-red/20 bg-ax-redSoft px-3 py-2 text-xs text-ax-red sm:mx-6">{error}</p>}
      <AnalyticsView loading={!data} heading="All campaigns"
        subheading={data ? `Cumulative • ${n} campaign${n === 1 ? "" : "s"} • ${apps} App${apps === 1 ? "" : "s"}` : undefined}
        totals={data?.totals ?? emptyTotals} apps={data?.apps ?? []} />
    </AxPanel>
  );
}
