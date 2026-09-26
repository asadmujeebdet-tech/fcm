"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import {
  Radio,
  ArrowUpRight,
  BarChart3,
  Send,
  CheckCheck,
  TrendingUp,
  Eye,
  XCircle,
  TimerReset,
  BellRing,
} from "lucide-react";
import { Card, EmptyState } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/StatusBadge";
import { FirebaseAppPublic, Message } from "@/types/database";

export function DashboardClient() {
  const [apps, setApps] = useState<FirebaseAppPublic[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/apps").then((r) => r.json()),
      fetch("/api/messages").then((r) => r.json()),
    ]).then(([appsRes, messagesRes]) => {
      setApps(appsRes.apps ?? []);
      setMessages(messagesRes.messages ?? []);
      setLoading(false);
    });
  }, []);

  const activeApps = apps.filter((a) => a.is_active).length;
  const totalSent = messages.reduce((sum, m) => sum + (m.total_sent || m.sent_count || 0), 0);
  const totalDelivered = messages.reduce((sum, m) => sum + (m.delivered || m.total_sent || 0), 0);
  const totalImpressions = messages.reduce((sum, m) => sum + (m.impressions || m.total_sent || 0), 0);
  const totalOpened = messages.reduce((sum, m) => sum + (m.opened || 0), 0);
  const totalDismissed = messages.reduce((sum, m) => sum + (m.dismissed || 0), 0);
  const totalFailed = messages.reduce((sum, m) => sum + (m.delivery_failed || m.total_failed || 0), 0);
  const scheduledCount = messages.filter((m) => m.status === "scheduled").length;

  const deliveryRate =
    totalSent + totalFailed === 0
      ? 0
      : Math.round((totalDelivered / Math.max(1, totalSent + totalFailed)) * 100);
  const openRate =
    totalImpressions === 0 ? 0 : Math.round((totalOpened / Math.max(1, totalImpressions)) * 100);
  const dismissRate =
    totalImpressions === 0 ? 0 : Math.round((totalDismissed / Math.max(1, totalImpressions)) * 100);

  const stats = [
    { label: "Connected apps", value: loading ? "—" : `${activeApps}/${apps.length}`, icon: BarChart3, tone: "signal" },
    { label: "Sent", value: loading ? "—" : totalSent.toLocaleString(), icon: Send, tone: "wave" },
    { label: "Delivered", value: loading ? "—" : totalDelivered.toLocaleString(), icon: CheckCheck, tone: "success" },
    { label: "Delivery rate", value: loading ? "—" : `${deliveryRate}%`, icon: TrendingUp, tone: "signal" },
    { label: "Impressions", value: loading ? "—" : totalImpressions.toLocaleString(), icon: BellRing, tone: "violet" },
    { label: "Opened", value: loading ? "—" : totalOpened.toLocaleString(), icon: Eye, tone: "info" },
    { label: "Open rate", value: loading ? "—" : `${openRate}%`, icon: TrendingUp, tone: "warning" },
    { label: "Dismissed", value: loading ? "—" : totalDismissed.toLocaleString(), icon: XCircle, tone: "danger" },
    { label: "Dismiss rate", value: loading ? "—" : `${dismissRate}%`, icon: TimerReset, tone: "muted" },
    { label: "Delivery failed", value: loading ? "—" : totalFailed.toLocaleString(), icon: XCircle, tone: "danger" },
    { label: "Scheduled", value: loading ? "—" : scheduledCount, icon: TimerReset, tone: "wave" },
  ];

  return (
    <div className="space-y-8">
      <div className="sticky top-0 z-20 -mx-2 mb-4 border-b border-border bg-ink/90 px-2 pb-4 pt-2 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Broadcast dashboard</h1>
            <p className="mt-1 text-sm text-ink2">Everything you're broadcasting, at a glance.</p>
          </div>
          <Link href="/compose">
            <Button>
              <Radio size={15} /> New broadcast
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        {stats.map((s) => {
          const Icon = s.icon;
          const toneStyles: Record<string, string> = {
            signal: "bg-signal/12 text-signal border-signal/25",
            wave: "bg-wave/12 text-wave border-wave/25",
            success: "bg-emerald-500/12 text-emerald-300 border-emerald-400/20",
            violet: "bg-violet-500/12 text-violet-300 border-violet-400/20",
            info: "bg-sky-500/12 text-sky-300 border-sky-400/20",
            warning: "bg-amber-500/12 text-amber-300 border-amber-400/20",
            danger: "bg-red-500/12 text-red-300 border-red-400/20",
            muted: "bg-slate-500/12 text-slate-300 border-slate-400/20",
          };

          return (
            <Card key={s.label} className="overflow-hidden border border-border bg-surface">
              <div className="flex items-start justify-between gap-4 p-5">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-ink2">{s.label}</p>
                  <p className="mt-3 font-mono text-2xl font-medium text-white">{s.value}</p>
                </div>
                <div className={`rounded-xl border p-2.5 ${toneStyles[s.tone]}`}>
                  <Icon size={18} />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-white">Recent activity</h2>
          <Link href="/history" className="flex items-center gap-1 text-xs text-ink2 hover:text-signal">
            View all <ArrowUpRight size={12} />
          </Link>
        </div>

        {!loading && messages.length === 0 ? (
          <EmptyState
            title="No broadcasts yet"
            description="Once you send or schedule your first message, it'll show up here with live delivery status."
            action={
              <Link href="/compose">
                <Button size="sm">Send your first broadcast</Button>
              </Link>
            }
          />
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-ink2">
                  <th className="px-5 py-3 font-normal">Message</th>
                  <th className="px-5 py-3 font-normal">Apps</th>
                  <th className="px-5 py-3 font-normal">Status</th>
                  <th className="px-5 py-3 font-normal">When</th>
                </tr>
              </thead>
              <tbody>
                {messages.slice(0, 6).map((m) => (
                  <tr key={m.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-3 text-white">
                      {m.format === "notification" ? m.notification_title : m.data_title}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-ink2">{m.total_apps_targeted}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={m.status} />
                    </td>
                    <td className="px-5 py-3 text-xs text-ink2">
                      {format(new Date(m.sent_at ?? m.scheduled_at ?? m.created_at), "MMM d, HH:mm")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}
