"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Radio, Calendar, Save, Smartphone, Eye, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Field";
import { FirebaseAppPublic } from "@/types/database";

const DEFAULT_PREVIEW_ICON =
  "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS90_MbyAab03ginKOTiuz932RRt0JmH-J7KzSxk65CQ&s=10";

export function ComposeClient() {
  const router = useRouter();
  const [apps, setApps] = useState<FirebaseAppPublic[]>([]);
  const [loadingApps, setLoadingApps] = useState(true);
  const [appSearch, setAppSearch] = useState("");
  const [selectedAppIds, setSelectedAppIds] = useState<Set<string>>(new Set());

  const [notificationTitle, setNotificationTitle] = useState("");
  const [notificationBody, setNotificationBody] = useState("");
  const [notificationImage, setNotificationImage] = useState("");
  const [showLivePreview, setShowLivePreview] = useState(false);

  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleTimes, setScheduleTimes] = useState<string[]>([""]);

  const [submitting, setSubmitting] = useState<"send_now" | "schedule" | "draft" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/apps")
      .then((r) => r.json())
      .then((data) => {
        const activeApps = (data.apps ?? []).filter((a: FirebaseAppPublic) => a.is_active);
        setApps(activeApps);
        setLoadingApps(false);
      });
  }, []);

  useEffect(() => {
    if (!showLivePreview) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showLivePreview]);

  const filteredApps = useMemo(
    () => apps.filter((a) => a.name.toLowerCase().includes(appSearch.toLowerCase())),
    [apps, appSearch]
  );

  const selectedApps = useMemo(
    () => apps.filter((app) => selectedAppIds.has(app.id)),
    [apps, selectedAppIds]
  );

  function toggleApp(id: string) {
    setSelectedAppIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedAppIds(new Set(filteredApps.map((a) => a.id)));
  }

  function deselectAll() {
    setSelectedAppIds(new Set());
  }

  const normalizedScheduleTimes = scheduleTimes
    .filter((time) => time && time.trim())
    .map((time) => time.trim());

  const canSubmit =
    selectedAppIds.size > 0 &&
    notificationTitle.trim() &&
    notificationBody.trim() &&
    (!scheduleEnabled || normalizedScheduleTimes.length > 0);

  async function handleSubmit(action: "send_now" | "schedule" | "draft") {
    setSubmitting(action);
    setError(null);
    setSuccessMessage(null);

    const body: Record<string, unknown> = {
      appIds: Array.from(selectedAppIds),
      topic: selectedApps.find((app) => (app.default_topic ?? "").trim())?.default_topic?.trim() || "all",
      format: "notification",
      action,
      ...(action === "schedule"
        ? { scheduledAt: normalizedScheduleTimes.map((time) => new Date(time).toISOString()) }
        : {}),
      notificationTitle,
      notificationBody,
      notificationImage: notificationImage || undefined,
    };

    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setSubmitting(null);

    if (!res.ok) {
      setError(data.error ?? "Something went wrong");
      return;
    }

    if (action === "send_now") {
      const m = data.message;
      setSuccessMessage(`Sent — ${m.total_sent} delivered, ${m.total_failed} failed.`);
    } else if (action === "schedule") {
      setSuccessMessage("Scheduled.");
      router.push("/history");
    } else {
      setSuccessMessage("Saved as draft.");
      router.push("/history");
    }
  }

  return (
    <>
      <div className="space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-white">Compose</h1>
            <p className="mt-1 text-sm text-ink2">Write once, dispatch to every app you select.</p>
          </div>

          <button
            type="button"
            onClick={() => setShowLivePreview(true)}
            className="live-preview-trigger"
            aria-label="Open live preview"
          >
            <Eye size={15} />
            <span>Live Preview</span>
          </button>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
          <Card className="space-y-6 p-6">
            <div>
              <Label>Title</Label>
              <Input value={notificationTitle} onChange={(e) => setNotificationTitle(e.target.value)} />
            </div>

            <div>
              <Label>Body</Label>
              <Textarea rows={4} value={notificationBody} onChange={(e) => setNotificationBody(e.target.value)} />
            </div>

            <div>
              <Label>Image URL (optional)</Label>
              <Input
                value={notificationImage}
                onChange={(e) => setNotificationImage(e.target.value)}
                placeholder="https://..."
              />
            </div>
          </Card>

          <div className="space-y-6">
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <Label>Target apps</Label>
                <span className="rounded-full border border-border bg-surface2 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-ink2">
                  {selectedAppIds.size} selected
                </span>
              </div>

              <div className="relative mb-3">
                <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink2" />
                <Input
                  value={appSearch}
                  onChange={(e) => setAppSearch(e.target.value)}
                  placeholder="Search apps..."
                  className="pl-8"
                />
              </div>

              <div className="mb-3 flex gap-3 text-xs text-ink2">
                <button type="button" onClick={selectAll} className="hover:text-signal">Select all</button>
                <button type="button" onClick={deselectAll} className="hover:text-signal">Deselect all</button>
              </div>

              <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-border bg-surface2/30 p-2">
                {loadingApps ? (
                  <p className="px-2 py-4 text-center text-xs text-ink2">Loading apps...</p>
                ) : filteredApps.length === 0 ? (
                  <p className="px-2 py-4 text-center text-xs text-ink2">No apps found.</p>
                ) : (
                  filteredApps.map((app) => (
                    <label
                      key={app.id}
                      className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-white hover:bg-surface2"
                    >
                      <input
                        type="checkbox"
                        checked={selectedAppIds.has(app.id)}
                        onChange={() => toggleApp(app.id)}
                        className="accent-signal"
                      />
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface2 text-ink2">
                        {app.app_icon_url ? (
                          <img src={app.app_icon_url} alt={app.name} className="h-full w-full object-cover" />
                        ) : (
                          <Smartphone size={13} />
                        )}
                      </div>
                      <span className="min-w-0 flex-1 truncate">{app.name}</span>
                    </label>
                  ))
                )}
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink2">Schedule</p>
              </div>

              <label className="mt-4 flex items-center gap-2.5 text-sm text-white">
                <input
                  type="checkbox"
                  checked={scheduleEnabled}
                  onChange={(e) => setScheduleEnabled(e.target.checked)}
                  className="accent-signal"
                />
                Schedule for later
              </label>

              {scheduleEnabled && (
                <div className="mt-3 space-y-2">
                  {scheduleTimes.map((time, index) => (
                    <div key={`schedule-${index}`} className="flex items-center gap-2">
                      <Input
                        type="datetime-local"
                        value={time}
                        onChange={(e) => {
                          const next = [...scheduleTimes];
                          next[index] = e.target.value;
                          setScheduleTimes(next);
                        }}
                      />
                      {scheduleTimes.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setScheduleTimes((prev) => prev.filter((_, i) => i !== index))}
                          className="text-xs text-ink2 hover:text-danger"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => setScheduleTimes((prev) => [...prev, ""])}
                    className="text-xs text-signal hover:underline"
                  >
                    + Add another time
                  </button>
                </div>
              )}
            </Card>

            <div className="space-y-2">
              {scheduleEnabled ? (
                <Button className="w-full" disabled={!canSubmit || submitting !== null} onClick={() => handleSubmit("schedule")}>
                  <Calendar size={15} /> {submitting === "schedule" ? "Scheduling..." : "Schedule"}
                </Button>
              ) : (
                <Button className="w-full" disabled={!canSubmit || submitting !== null} onClick={() => handleSubmit("send_now")}>
                  <Radio size={15} /> {submitting === "send_now" ? "Sending..." : "Send now"}
                </Button>
              )}

              <Button
                variant="secondary"
                className="w-full"
                disabled={!canSubmit || submitting !== null}
                onClick={() => handleSubmit("draft")}
              >
                <Save size={15} /> {submitting === "draft" ? "Saving..." : "Save as draft"}
              </Button>
            </div>

            {error && <p className="text-xs text-danger">{error}</p>}
            {successMessage && <p className="text-xs text-wave">{successMessage}</p>}
          </div>
        </div>
      </div>

      {showLivePreview && (
        <div className="live-preview-overlay" role="dialog" aria-modal="true" aria-label="Live notification preview">
          <button
            type="button"
            className="live-preview-backdrop"
            onClick={() => setShowLivePreview(false)}
            aria-label="Close preview"
          />

          <div className="live-preview-modal">
            <button
              type="button"
              onClick={() => setShowLivePreview(false)}
              className="live-preview-close"
              aria-label="Close live preview"
            >
              <X size={18} />
            </button>

            <div className="live-preview-phone-stage">
              <div className="phone live-preview-phone">
                <div className="phone-screen">
                  <div className="phone-status">
                    <span>9:41</span>
                    <div className="dynamic-island"><i /></div>
                    <div className="status-icons">
                      <b>▮▮▮</b>
                      <span>⌁</span>
                      <em />
                    </div>
                  </div>

                  <div className="lock-date">Tue, 23 Sep</div>
                  <div className="lock-time">9:41</div>

                  <div className="notification-card live-notification-card">
                    <div className="notification-text">
                      <div className="notification-title">
                        <strong>{notificationTitle.trim() || "Notification title"}</strong>
                        <span> · Now</span>
                      </div>
                      <div className="notification-body">
                        {(notificationBody.trim() || "Your notification body will appear here.")
                          .split(/\n+/)
                          .slice(0, 3)
                          .map((line, index) => (
                            <div key={`preview-line-${index}`}>{line || " "}</div>
                          ))}
                      </div>
                    </div>

                    {notificationImage.trim() ? (
                      <img
                        src={notificationImage.trim()}
                        alt=""
                        className="whatsapp-icon live-preview-image"
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                      />
                    ) : (
                      <img
                        src={DEFAULT_PREVIEW_ICON}
                        alt=""
                        className="whatsapp-icon live-preview-image"
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                      />
                    )}
                  </div>

                  <div className="lock-shortcuts">
                    <span>▮</span>
                    <span>●</span>
                  </div>
                  <div className="home-indicator" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
