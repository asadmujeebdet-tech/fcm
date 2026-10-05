export type Totals = { sent: number; failed: number; delivered: number; shown: number; opened: number; dismissed: number };
export type AppRow = Totals & { id: string; name: string; icon: string | null };

export const emptyTotals: Totals = { sent: 0, failed: 0, delivered: 0, shown: 0, opened: 0, dismissed: 0 };

export function toTotals(row: Partial<Record<keyof Totals, unknown>> | null | undefined): Totals {
  const n = (v: unknown) => Number(v ?? 0) || 0;
  return { sent: n(row?.sent), failed: n(row?.failed), delivered: n(row?.delivered), shown: n(row?.shown), opened: n(row?.opened), dismissed: n(row?.dismissed) };
}

export function pct(value: number, of: number): number | null {
  return of > 0 ? (value / of) * 100 : null;
}

/**
 * Funnel rates. "Sent" is the number of apps FCM accepted for a topic send, while Delivered/Shown/
 * Opened/Dismissed are device events reported by the apps, so Delivered can legitimately exceed Sent.
 * In that case a delivery *rate* is meaningless, so it is returned as null (shown as "—").
 */
export function rates(t: Totals) {
  return {
    delivery: t.sent > 0 && t.delivered <= t.sent ? pct(t.delivered, t.sent) : null,
    show: t.shown <= t.delivered ? pct(t.shown, t.delivered) : null,
    open: pct(t.opened, t.shown),
    dismiss: pct(t.dismissed, t.shown),
  };
}

export const fmtNum = (n: number) => n.toLocaleString("en-US");
export const fmtPct = (v: number | null, digits = 1) => (v === null ? "—" : `${v.toFixed(digits)}%`);

export function formatPakistanDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const datePart = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Karachi", year: "numeric", month: "short", day: "numeric" }).format(date);
  const timePart = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Karachi", hour: "numeric", minute: "2-digit", hour12: true }).format(date);
  return datePart + " • " + timePart;
}

export function formatPakistanDay(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Karachi", year: "numeric", month: "short", day: "numeric" }).format(date);
}

export function timeAgo(from: Date | null, now = Date.now()) {
  if (!from) return "waiting for data";
  const s = Math.max(0, Math.round((now - from.getTime()) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
}
