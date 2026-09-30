"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Radio, Calendar, Smartphone, Eye, ChevronDown, ChevronUp, Minus, Upload, X } from "lucide-react";
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
  const [previewImageUrl, setPreviewImageUrl] = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const [showLivePreview, setShowLivePreview] = useState(false);

  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleRepeat, setScheduleRepeat] = useState<"never" | "daily">("never");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleStartDate, setScheduleStartDate] = useState("");
  const [scheduleEndDate, setScheduleEndDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");

  function buildScheduledTimes() {
    if (!scheduleEnabled) return [];

    if (scheduleRepeat === "never") {
      if (!scheduleDate || !scheduleTime) return [];
      return [`${scheduleDate}T${scheduleTime}:00+05:00`];
    }

    if (!scheduleStartDate || !scheduleEndDate || !scheduleTime) return [];

    const start = new Date(`${scheduleStartDate}T00:00:00`);
    const end = new Date(`${scheduleEndDate}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];

    const dates: string[] = [];
    const cursor = new Date(start);
    while (cursor <= end && dates.length < 366) {
      dates.push(
        `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`
      );
      cursor.setDate(cursor.getDate() + 1);
    }
    if (cursor <= end) return [];

    return dates.map((date) => `${date}T${scheduleTime}:00+05:00`);
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
    return () => {
      if (previewImageUrl.startsWith("blob:")) URL.revokeObjectURL(previewImageUrl);
    };
  }, [previewImageUrl]);

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

  const scheduledPakistanIsoTimes = buildScheduledTimes();

  const payloadSizes = useMemo(() => {
    const hasMessageContent =
      notificationTitle.trim().length > 0 ||
      notificationBody.trim().length > 0 ||
      notificationImage.trim().length > 0;

    if (!hasMessageContent) return [{ appId: "", appName: "", bytes: 0 }];

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
    (!scheduleEnabled || scheduledPakistanIsoTimes.length > 0) &&
    (!scheduleEnabled ||
      scheduleRepeat !== "daily" ||
      (!!scheduleStartDate &&
        !!scheduleEndDate &&
        new Date(`${scheduleEndDate}T00:00:00`) >= new Date(`${scheduleStartDate}T00:00:00`)));


  async function handleImageUpload(file: File | undefined) {
    if (!file) return;
    setImageUploadError(null);
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setImageUploadError("Use JPG, PNG, or WEBP images.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageUploadError("Image must be 5 MB or smaller.");
      return;
    }
    setImageUploading(true);
    const localPreviewUrl = URL.createObjectURL(file);
    setPreviewImageUrl(localPreviewUrl);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/uploads/notification-image", { method: "POST", body: formData });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) throw new Error(data?.error ?? "Image upload failed.");
      // Keep the local blob URL for Live Preview. The uploaded public URL is used for FCM,
      // while the local preview avoids intermittent CDN/browser image-loading failures.
      setNotificationImage(data.url);
    } catch (e) {
      setImageUploadError(e instanceof Error ? e.message : "Image upload failed.");
    } finally {
      setImageUploading(false);
      if (imageFileInputRef.current) imageFileInputRef.current.value = "";
    }
  }

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
              <div className="flex gap-2">
                <Input
                  className="min-w-0 flex-1"
                  value={notificationImage}
                  onChange={(e) => { const value = e.target.value; setNotificationImage(value); setPreviewImageUrl(value); setImageUploadError(null); }}
                  placeholder="Paste image URL..."
                />
                <input
                  ref={imageFileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => void handleImageUpload(e.target.files?.[0])}
                />
                <button
                  type="button"
                  onClick={() => imageFileInputRef.current?.click()}
                  disabled={imageUploading}
                  className="shrink-0 rounded-lg border border-border bg-surface2 px-3 text-xs font-medium text-white transition hover:bg-surface3 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="inline-flex items-center gap-1.5"><Upload size={14} />{imageUploading ? "Uploading..." : "Upload Image"}</span>
                </button>
              </div>
              {notificationImage.trim() && (
                <div className="mt-2 flex items-center gap-2 text-[11px] text-ink2">
                  <span className="truncate">{notificationImage}</span>
                  <button type="button" onClick={() => { setNotificationImage(""); setPreviewImageUrl(""); }} className="shrink-0 hover:text-white" aria-label="Remove image">
                    <X size={13} />
                  </button>
                </div>
              )}
              {imageUploadError && <p className="mt-1.5 text-xs text-danger">{imageUploadError}</p>}
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
                <div className="mt-3 space-y-4">
                  <div>
                    <label className="mb-1.5 block text-[11px] font-medium text-ink2">Repeat</label>
                    <select
                      value={scheduleRepeat}
                      onChange={(e) => setScheduleRepeat(e.target.value as "never" | "daily")}
                      className="w-full rounded-lg border border-border bg-surface2 px-3 py-2.5 text-xs text-white outline-none focus:border-signal"
                    >
                      <option value="never">Never</option>
                      <option value="daily">Daily</option>
                    </select>
                  </div>

                  {scheduleRepeat === "daily" ? (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1.5 block text-[11px] font-medium text-ink2">Start Date</label>
                          <input
                            type="date"
                            value={scheduleStartDate}
                            onChange={(e) => setScheduleStartDate(e.target.value)}
                            className="w-full rounded-lg border border-border bg-surface2 px-3 py-2.5 text-xs text-white outline-none focus:border-signal"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-[11px] font-medium text-ink2">End Date</label>
                          <input
                            type="date"
                            min={scheduleStartDate || undefined}
                            value={scheduleEndDate}
                            onChange={(e) => setScheduleEndDate(e.target.value)}
                            className="w-full rounded-lg border border-border bg-surface2 px-3 py-2.5 text-xs text-white outline-none focus:border-signal"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="mb-1.5 block text-[11px] font-medium text-ink2">Send Time</label>
                        <input
                          type="time"
                          value={scheduleTime}
                          onChange={(e) => setScheduleTime(e.target.value)}
                          className="w-full rounded-lg border border-border bg-surface2 px-3 py-2.5 text-xs text-white outline-none focus:border-signal"
                        />
                      </div>

                      {scheduleStartDate && scheduleEndDate && scheduleTime &&
                        new Date(`${scheduleEndDate}T00:00:00`) >= new Date(`${scheduleStartDate}T00:00:00`) && (
                          <div className="rounded-lg border border-signal/20 bg-signal/5 px-3 py-2.5">
                            <p className="text-[11px] font-semibold text-white">
                              🔁 Daily at {new Date(`1970-01-01T${scheduleTime}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                            </p>
                            <p className="mt-0.5 text-[10px] text-ink2">
                              From {new Date(`${scheduleStartDate}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                              {" "}to{" "}
                              {new Date(`${scheduleEndDate}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </p>
                          </div>
                        )}

                      {scheduleStartDate && scheduleEndDate &&
                        new Date(`${scheduleEndDate}T00:00:00`) < new Date(`${scheduleStartDate}T00:00:00`) && (
                          <p className="text-[10px] text-danger">End date must be on or after the start date.</p>
                        )}
                    </>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1.5 block text-[11px] font-medium text-ink2">Date</label>
                        <input
                          type="date"
                          value={scheduleDate}
                          onChange={(e) => setScheduleDate(e.target.value)}
                          className="w-full rounded-lg border border-border bg-surface2 px-3 py-2.5 text-xs text-white outline-none focus:border-signal"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-[11px] font-medium text-ink2">Send Time</label>
                        <input
                          type="time"
                          value={scheduleTime}
                          onChange={(e) => setScheduleTime(e.target.value)}
                          className="w-full rounded-lg border border-border bg-surface2 px-3 py-2.5 text-xs text-white outline-none focus:border-signal"
                        />
                      </div>
                    </div>
                  )}
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

                    {(previewImageUrl.trim() || notificationImage.trim()) ? (
                      <img
                        src={(previewImageUrl.trim() || notificationImage.trim())}
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
