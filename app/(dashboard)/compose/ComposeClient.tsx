"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Radio, Calendar, Smartphone, Eye, ChevronDown, ChevronUp, Minus } from "lucide-react";
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
  const [inactiveAppCount, setInactiveAppCount] = useState(0);
  const [appsLoadError, setAppsLoadError] = useState<string | null>(null);
  const [appSearchOpen, setAppSearchOpen] = useState(false);
  const [appSearch, setAppSearch] = useState("");
  const [selectedAppIds, setSelectedAppIds] = useState<Set<string>>(new Set());
  const appPickerRef = useRef<HTMLDivElement>(null);
  const scheduleDateRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const [notificationTitle, setNotificationTitle] = useState("");
  const [notificationBody, setNotificationBody] = useState("");
  const [notificationImage, setNotificationImage] = useState("");
  const [showLivePreview, setShowLivePreview] = useState(false);

  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleTimes, setScheduleTimes] = useState<string[]>(["|||AM"]);
  const [scheduleHourDrafts, setScheduleHourDrafts] = useState<Record<number, string>>({});
  const [scheduleMinuteDrafts, setScheduleMinuteDrafts] = useState<Record<number, string>>({});

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
        const allApps: FirebaseAppPublic[] = data.apps ?? [];
        const activeApps = allApps.filter((a) => a.is_active);
        setApps(activeApps);
        setInactiveAppCount(allApps.length - activeApps.length);
      })
      .catch(() => setAppsLoadError("Could not load apps. Refresh the page."))
      .finally(() => setLoadingApps(false));
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

  const payloadSizes = useMemo(() => {
    const encoder = new TextEncoder();
    const appsToMeasure = selectedApps.length
      ? selectedApps
      : [{ id: "", name: "", topic: "" } as FirebaseAppPublic];

    return appsToMeasure.map((app) => {
      const payload = {
        message: {
          topic: app.topic?.trim() ?? "",
          android: {
            priority: "HIGH",
          },
          notification: {
            title: notificationTitle ?? "",
            body: notificationBody ?? "",
            ...(notificationImage.trim() ? { image: notificationImage.trim() } : {}),
          },
        },
      };
      return {
        appId: app.id,
        appName: app.name,
        bytes: encoder.encode(JSON.stringify(payload)).byteLength,
      };
    });
  }, [selectedApps, notificationTitle, notificationBody, notificationImage]);

  const maxPayloadSize = Math.max(...payloadSizes.map((item) => item.bytes));
  const payloadTooLarge = maxPayloadSize > 2048;

  const canSubmit =
    selectedAppIds.size > 0 &&
    notificationTitle.trim() &&
    notificationBody.trim() &&
    !payloadTooLarge &&
    (!scheduleEnabled || scheduledPakistanIsoTimes.length > 0);

  async function handleSubmit(action: "send_now" | "schedule") {
    setSubmitting(action);
    setError(null);
    setSuccessMessage(null);

    const body: Record<string, unknown> = {
      appIds: Array.from(selectedAppIds),
      topic: "",
      format: "notification",
      action,
      ...(action === "schedule"
        ? { scheduledAt: scheduledPakistanIsoTimes }
        : {}),
      notificationTitle,
      notificationBody,
      notificationImage: notificationImage || undefined,
    };

    let res: Response;
    try {
      res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      setSubmitting(null);
      setError("Network error. The broadcast may have been partially sent. Check History before trying again.");
      return;
    }

    // A platform timeout returns an HTML error page, not JSON.
    const data = await res.json().catch(() => null);
    setSubmitting(null);

    if (!res.ok || !data) {
      setError(
        data?.error ??
          `Server error (HTTP ${res.status}). Some apps may already have received this. Check History before sending again.`
      );
      return;
    }

    if (action === "send_now") {
      const m = data.message;
      const failedTargets = (data.targets ?? []).filter((target: { status?: string; error_message?: string | null }) => target.status === "failed");
      const failedDetails = failedTargets
        .map((target: { app_name?: string | null; error_message?: string | null }) => `${target.app_name || "Target app"}: ${target.error_message || "Unknown FCM error"}`)
        .join(" | ");
      if (m.total_failed > 0) {
        setSuccessMessage(`${m.total_sent} accepted by FCM, ${m.total_failed} failed.${failedDetails ? ` Error: ${failedDetails}` : ""}`);
      } else {
        setSuccessMessage(`${m.total_sent} accepted by FCM, ${m.total_failed} failed. Devices receive it only if they are subscribed to the app's topic.`);
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
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <Label>Image URL (optional)</Label>
                <span
                  className={`text-[11px] font-medium ${payloadTooLarge ? "text-danger" : "text-ink2"}`}
                  aria-live="polite"
                >
                  {maxPayloadSize.toLocaleString()} / 2,048 bytes
                </span>
              </div>
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
              {appsLoadError && <p className="mt-2 text-xs text-danger">{appsLoadError}</p>}
              {inactiveAppCount > 0 && (
                <p className="target-apps-subtitle mt-2">
                  {inactiveAppCount} inactive app{inactiveAppCount === 1 ? " is" : "s are"} hidden. Activate {inactiveAppCount === 1 ? "it" : "them"} on the Apps page to include {inactiveAppCount === 1 ? "it" : "them"}.
                </p>
              )}
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
                        <div className="schedule-single-line">
                          <div className="schedule-date-control">
                            <input
                              ref={(element) => { scheduleDateRefs.current[index] = element; }}
                              type="date"
                              value={parsed.date}
                              onChange={(e) => {
                                const next = [...scheduleTimes];
                                next[index] = buildScheduleValue(e.target.value, parsed.hour, parsed.minute, parsed.period);
                                setScheduleTimes(next);
                              }}
                              aria-label="Schedule date"
                            />
                            <button
                              type="button"
                              onClick={() => scheduleDateRefs.current[index]?.showPicker?.()}
                              aria-label="Open date picker"
                              className="schedule-calendar-button"
                            >
                              <Calendar size={15} />
                            </button>
                          </div>
                          <div className="schedule-time-control">
                            <input
                              type="text"
                              inputMode="numeric"
                              maxLength={2}
                              value={scheduleHourDrafts[index] ?? (parsed.hour ? parsed.hour.padStart(2, "0") : "")}
                              onChange={(e) => {
                                const raw = e.target.value.replace(/\D/g, "").slice(0, 2);
                                setScheduleHourDrafts((prev) => ({ ...prev, [index]: raw }));
                              }}
                              onBlur={() => {
                                const raw = (scheduleHourDrafts[index] ?? parsed.hour ?? "").trim();
                                if (!raw) return;
                                const hour = Math.min(12, Math.max(1, Number(raw) || 12));
                                const next = [...scheduleTimes];
                                next[index] = buildScheduleValue(parsed.date, String(hour), parsed.minute, parsed.period);
                                setScheduleTimes(next);
                                setScheduleHourDrafts((prev) => ({ ...prev, [index]: String(hour).padStart(2, "0") }));
                              }}
                              placeholder="hh"
                              aria-label="Schedule hour"
                              className="schedule-part-input schedule-hour-input"
                            />
                            <span className="schedule-time-colon" aria-hidden="true">:</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              maxLength={2}
                              value={scheduleMinuteDrafts[index] ?? (parsed.hour ? parsed.minute : "")}
                              onChange={(e) => {
                                const raw = e.target.value.replace(/\D/g, "").slice(0, 2);
                                setScheduleMinuteDrafts((prev) => ({ ...prev, [index]: raw }));
                              }}
                              onBlur={() => {
                                const raw = (scheduleMinuteDrafts[index] ?? parsed.minute ?? "").trim();
                                const minute = Math.min(59, Math.max(0, Number(raw) || 0));
                                const next = [...scheduleTimes];
                                next[index] = buildScheduleValue(parsed.date, parsed.hour, String(minute).padStart(2, "0"), parsed.period);
                                setScheduleTimes(next);
                                setScheduleMinuteDrafts((prev) => ({ ...prev, [index]: String(minute).padStart(2, "0") }));
                              }}
                              placeholder="mm"
                              aria-label="Schedule minute"
                              className="schedule-part-input schedule-minute-input"
                            />
                            <div className="schedule-period-control" aria-label="AM or PM">
                              <button
                                type="button"
                                className={`schedule-period-arrow${parsed.period === "AM" ? " is-active" : ""}`}
                                onClick={() => {
                                  const next = [...scheduleTimes];
                                  next[index] = buildScheduleValue(parsed.date, parsed.hour, parsed.minute, "AM");
                                  setScheduleTimes(next);
                                }}
                                aria-label="Set AM"
                                title="AM"
                              >
                                <ChevronUp size={12} />
                              </button>
                              <span>{parsed.period}</span>
                              <button
                                type="button"
                                className={`schedule-period-arrow${parsed.period === "PM" ? " is-active" : ""}`}
                                onClick={() => {
                                  const next = [...scheduleTimes];
                                  next[index] = buildScheduleValue(parsed.date, parsed.hour, parsed.minute, "PM");
                                  setScheduleTimes(next);
                                }}
                                aria-label="Set PM"
                                title="PM"
                              >
                                <ChevronDown size={12} />
                              </button>
                            </div>
                          </div>                        </div>

                        <div className="flex items-center justify-end gap-2">
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
                    onClick={() => {
                      setScheduleTimes((prev) => [...prev, "|||AM"]);
                      setScheduleHourDrafts((prev) => ({ ...prev, [scheduleTimes.length]: "" }));
                      setScheduleMinuteDrafts((prev) => ({ ...prev, [scheduleTimes.length]: "" }));
                    }}
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
