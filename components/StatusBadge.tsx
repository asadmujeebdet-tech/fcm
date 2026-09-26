import { Badge } from "@/components/ui/Card";

const map: Record<string, { label: string; tone: "neutral" | "signal" | "wave" | "danger" | "muted" }> = {
  draft: { label: "Draft", tone: "muted" },
  scheduled: { label: "Scheduled", tone: "signal" },
  sending: { label: "Sending", tone: "signal" },
  sent: { label: "Sent", tone: "wave" },
  partial_failure: { label: "Partial failure", tone: "danger" },
  failed: { label: "Failed", tone: "danger" },
  canceled: { label: "Canceled", tone: "muted" },
  pending: { label: "Pending", tone: "muted" },
};

export function StatusBadge({ status }: { status: string }) {
  const entry = map[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}
