export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border border-border bg-surface ${className}`}>{children}</div>
  );
}

type BadgeTone = "neutral" | "signal" | "wave" | "danger" | "muted";

const badgeTones: Record<BadgeTone, string> = {
  neutral: "bg-surface2 text-white border-border",
  signal: "bg-signal/10 text-signal border-signal/30",
  wave: "bg-wave/10 text-wave border-wave/30",
  danger: "bg-danger/10 text-danger border-danger/30",
  muted: "bg-transparent text-ink2 border-border",
};

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: BadgeTone }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${badgeTones[tone]}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 py-16 text-center">
      <p className="text-sm font-medium text-white">{title}</p>
      <p className="max-w-sm text-sm text-ink2">{description}</p>
      {action}
    </div>
  );
}
