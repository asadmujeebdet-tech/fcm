"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Radio, Calendar, Smartphone, Eye, ChevronDown, Minus } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, Textarea } from "@/components/ui/Field";
import { FirebaseAppPublic } from "@/types/database";

const DEFAULT_PREVIEW_ICON =
  "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS90_MbyAab03ginKOTiuz932RRt0JmH-J7KzSxk65CQ&s=10";

export function ComposeClient() {
  const router = useRouter();
  const [apps, setApps] = useState<FirebaseAppPublic[]>([]);
  const [loadingApps, setLoadingApps] = useState(true);
  const [appSearchOpen, setAppSearchOpen] = useState(false);
  const [appSearch, setAppSearch] = useState("");
  const [selectedAppIds, setSelectedAppIds] = useState<Set<string>>(new Set());
  const appPickerRef = useRef<HTMLDivElement>(null);

  const [notificationTitle, setNotificationTitle] = useState("");
  const [notificationBody, setNotificationBody] = useState("");
  const [notificationImage, setNotificationImage] = useState("");
  const [showLivePreview, setShowLivePreview] = useState(false);

  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleTimes, setScheduleTimes] = useState<string[]>(["|||AM"]);

  function parseScheduleValue(value: string) {
    const parts = value.split("|");
    if (parts.length === 4) {
      return {
        date: parts[0],
        hour: parts[1],
        minute: parts[2] || "00",
        period: (parts[3] === "PM" ? "PM" : "AM") as "AM" | "PM",
      };
    }
    const match = value.match(/^(\d{4}-\d{2}-\d{2}) (\d{1,2}):(\d{2}) (AM|PM)$/);
    return match
      ? { date: match[1], hour: match[2], minute: match[3], period: match[4] as "AM" | "PM" }
      : { date: "", hour: "", minute: "00", period: "AM" as const };
  }

  function buildScheduleValue(date: string, hour: string, minute: string, period: string) {
    return [date, hour, minute || "00", period || "AM"].join("|");
  }

  function scheduleValueToPakistanIso(value: string) {
    const parsed = parseScheduleValue(value);
    if (!parsed.date || !parsed.hour) return "";
    let hour = Number(parsed.hour);
    if (parsed.period === "AM") hour = hour === 12 ? 0 : hour;
    else hour = hour === 12 ? 12 : hour + 12;
    const hh = String(hour).padStart(2, "0");
    return `${parsed.date}T${hh}:${parsed.minute}:00+05:00`;
  }

  const [submitting, setSubmitting] = useState<"send_now" | "schedule" | null>(null);
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
    if (!appSearchOpen) return;
    function handleOutsideClick(event: MouseEvent) {
      if (appPickerRef.current && !appPickerRef.current.contains(event.target as Node)) {
        setAppSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [appSearchOpen]);

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

  function toggleAllApps() {
    setSelectedAppIds((prev) => {
      if (prev.size === apps.length && apps.length > 0) return new Set();
      return new Set(apps.map((app) => app.id));
    });
  }

  const normalizedScheduleTimes = scheduleTimes
    .map((time) => time.trim())
    .filter(Boolean);

  const scheduledPakistanIsoTimes = normalizedScheduleTimes
    .map(scheduleValueToPakistanIso)
    .filter(Boolean);

  const canSubmit =
    selectedAppIds.size > 0 &&
    notificationTitle.trim() &&
    notificationBody.trim() &&
    (!scheduleEnabled || scheduledPakistanIsoTimes.length > 0);

  async function handleSubmit(action: "send_now" | "schedule") {
    setSubmitting(action);
    setError(null);
    setSuccessMessage(null);

    const body: Record<string, unknown> = {
      appIds: Array.from(selectedAppIds),
      topic: selectedApps.find((app) => (app.default_topic ?? "").trim())?.default_topic?.trim() || "all",
      format: "notification",
      action,
      ...(action === "schedule"
        ? { scheduledAt: scheduledPakistanIsoTimes }
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
      const failedTargets = (data.targets ?? []).filter((target: { status?: string; error_message?: string | null }) => target.status === "failed");
      const failedDetails = failedTargets
        .map((target: { app_name?: string | null; error_message?: string | null }) => `${target.app_name || "Target app"}: ${target.error_message || "Unknown FCM error"}`)
        .join(" | ");
      if (m.total_failed > 0) {
        setSuccessMessage(`Sent — ${m.total_sent} delivered, ${m.total_failed} failed.${failedDetails ? ` Error: ${failedDetails}` : ""}`);
      } else {
        setSuccessMessage(`Sent — ${m.total_sent} delivered, ${m.total_failed} failed.`);
      }
    } else if (action === "schedule") {
      setSuccessMessage("Scheduled.");
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
              <div className="target-apps-heading">
                <div>
                  <Label>Target apps</Label>
                  <p className="target-apps-subtitle">Choose where this notification will be delivered.</p>
                </div>
                <span className="target-apps-count">{selectedAppIds.size} selected</span>
              </div>

              <div className="target-app-picker" ref={appPickerRef}>
                <button
                  type="button"
                  className={`target-app-picker-trigger${appSearchOpen ? " is-open" : ""}`}
                  onClick={() => setAppSearchOpen((open) => !open)}
                  aria-expanded={appSearchOpen}
                >
                  <span>Select App</span>
                  <ChevronDown size={15} />
                </button>

                {appSearchOpen && (
                  <div className="target-app-picker-menu">
                    <div className="target-app-picker-search">
                      <button
                        type="button"
                        className="target-app-select-all"
                        onClick={toggleAllApps}
                        aria-label={
                          selectedAppIds.size === apps.length && apps.length > 0
                            ? "Deselect all apps"
                            : "Select all apps"
                        }
                        title={
                          selectedAppIds.size === apps.length && apps.length > 0
                            ? "Deselect all apps"
                            : "Select all apps"
                        }
                      >
                        <Minus size={14} />
                      </button>
                      <Search size={14} />
                      <input
                        value={appSearch}
                        onChange={(e) => setAppSearch(e.target.value)}
                        placeholder="Search apps..."
                        autoFocus
                      />
                    </div>

                    <div className="target-app-picker-results">
                      {loadingApps ? (
                        <p className="target-app-empty">Loading apps...</p>
                      ) : filteredApps.length === 0 ? (
                        <p className="target-app-empty">No apps found.</p>
                      ) : (
                        filteredApps.map((app) => (
                          <label key={app.id} className="target-app-row">
                            <input
                              type="checkbox"
                              checked={selectedAppIds.has(app.id)}
                              onChange={() => toggleApp(app.id)}
                              className="target-app-checkbox"
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
                  </div>
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
                <div className="mt-3 space-y-3">
{scheduleTimes.map((time, index) => {
                    const parsed = parseScheduleValue(time);
                    return (
                      <div key={`schedule-${index}`} className="space-y-2 rounded-lg border border-border p-3">
                        <div className="schedule-time-grid">
                          <Input
                            type="date"
                            value={parsed.date}
                            onChange={(e) => {
                              const next = [...scheduleTimes];
                              next[index] = buildScheduleValue(e.target.value, parsed.hour, parsed.minute, parsed.period);
                              setScheduleTimes(next);
                            }}
                            aria-label="Schedule date"
                          />
                          <Select
                            value={parsed.hour}
                            onChange={(e) => {
                              const next = [...scheduleTimes];
                              next[index] = buildScheduleValue(parsed.date, e.target.value, parsed.minute, parsed.period);
                              setScheduleTimes(next);
                            }}
                            aria-label="Schedule hour"
                          >
                            <option value="">Hour</option>
                            {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((hour) => (
                              <option key={hour} value={hour}>{hour}</option>
                            ))}
                          </Select>
                          <Select
                            value={parsed.minute}
                            onChange={(e) => {
                              const next = [...scheduleTimes];
                              next[index] = buildScheduleValue(parsed.date, parsed.hour, e.target.value, parsed.period);
                              setScheduleTimes(next);
                            }}
                            aria-label="Schedule minute"
                          >
                            {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")).map((minute) => (
                              <option key={minute} value={minute}>{minute}</option>
                            ))}
                          </Select>
                          <Select
                            value={parsed.period}
                            onChange={(e) => {
                              const next = [...scheduleTimes];
                              next[index] = buildScheduleValue(parsed.date, parsed.hour, parsed.minute, e.target.value);
                              setScheduleTimes(next);
                            }}
                            aria-label="AM or PM"
                          >
                            <option value="AM">AM</option>
                            <option value="PM">PM</option>
                          </Select>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] text-ink2">
                            {parsed.date && parsed.hour ? `PKT: ${parsed.date} ${parsed.hour}:${parsed.minute} ${parsed.period}` : "Select date and time"}
                          </span>
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
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => setScheduleTimes((prev) => [...prev, "|||AM"])}
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
                          event.currentTarget.src = DEFAULT_PREVIEW_ICON;
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
