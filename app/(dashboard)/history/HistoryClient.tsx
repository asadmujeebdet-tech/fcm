"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { X, Ban } from "lucide-react";
import { Card, EmptyState } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/StatusBadge";
import { Message, MessageTarget } from "@/types/database";

type TargetRow = MessageTarget & { firebase_apps: { name: string } | null };

export function HistoryClient() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Message | null>(null);
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [loadingTargets, setLoadingTargets] = useState(false);

  async function loadMessages() {
    setLoading(true);
    const res = await fetch("/api/messages");
    const data = await res.json();
    setMessages(data.messages ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadMessages();
  }, []);

  async function openDetail(message: Message) {
    setSelected(message);
    setLoadingTargets(true);
    const res = await fetch(`/api/messages/${message.id}`);
    const data = await res.json();
    setTargets(data.targets ?? []);
    setLoadingTargets(false);
  }

  async function cancelMessage(message: Message) {
    if (!confirm("Cancel this scheduled message?")) return;
    await fetch(`/api/messages/${message.id}`, { method: "DELETE" });
    loadMessages();
    setSelected(null);
  }

  return (
    <div className="flex gap-6">
      <div className="flex-1 space-y-8">
        <div>
          <h1 className="text-xl font-semibold text-white">History</h1>
          <p className="mt-1 text-sm text-ink2">Every broadcast — sent, scheduled, or drafted.</p>
        </div>

        {!loading && messages.length === 0 ? (
          <EmptyState
            title="Nothing sent yet"
            description="Your broadcast history will show up here once you send or schedule a message."
          />
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-ink2">
                  <th className="px-5 py-3 font-normal">Message</th>
                  <th className="px-5 py-3 font-normal">Format</th>
                  <th className="px-5 py-3 font-normal">Apps</th>
                  <th className="px-5 py-3 font-normal">Delivered / Failed</th>
                  <th className="px-5 py-3 font-normal">Status</th>
                  <th className="px-5 py-3 font-normal">When</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((m) => (
                  <tr
                    key={m.id}
                    onClick={() => openDetail(m)}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-surface2/50"
                  >
                    <td className="px-5 py-3 text-white">
                      {m.format === "notification" ? m.notification_title : m.data_title}
                    </td>
                    <td className="px-5 py-3 text-xs text-ink2">
                      {m.format === "notification" ? "Notification" : "Custom data"}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-ink2">{m.total_apps_targeted}</td>
                    <td className="px-5 py-3 font-mono text-xs text-ink2">
                      {m.total_sent} / {m.total_failed}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={m.status} />
                    </td>
                    <td className="px-5 py-3 text-xs text-ink2">
                      {format(new Date(m.scheduled_at ?? m.sent_at ?? m.created_at), "MMM d, HH:mm")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      {selected && (
        <Card className="h-fit w-80 shrink-0 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium text-white">Delivery detail</h2>
            <button onClick={() => setSelected(null)} className="text-ink2 hover:text-white">
              <X size={15} />
            </button>
          </div>

          <p className="mb-1 text-sm text-white">
            {selected.format === "notification" ? selected.notification_title : selected.data_title}
          </p>
          <div className="mb-4 flex items-center gap-2">
            <StatusBadge status={selected.status} />
            {["draft", "scheduled"].includes(selected.status) && (
              <button
                onClick={() => cancelMessage(selected)}
                className="flex items-center gap-1 text-xs text-danger hover:underline"
              >
                <Ban size={11} /> Cancel
              </button>
            )}
          </div>

          {loadingTargets ? (
            <p className="text-xs text-ink2">Loading...</p>
          ) : (
            <div className="space-y-2">
              {targets.map((t) => (
                <div key={t.id} className="rounded-md border border-border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white">{t.firebase_apps?.name ?? "Unknown app"}</span>
                    <StatusBadge status={t.status} />
                  </div>
                  {t.error_message && <p className="mt-1 text-xs text-danger">{t.error_message}</p>}
                  {t.fcm_message_id && (
                    <p className="mt-1 truncate font-mono text-[10px] text-ink2">{t.fcm_message_id}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
