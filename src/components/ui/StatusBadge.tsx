type StatusBadgeProps = {
  status: "pending" | "approved" | "rejected" | string;
  label?: string;
};

const statusStyles: Record<string, string> = {
  pending: "border-warning/30 bg-warning/10 text-warning",
  approved: "border-success/30 bg-success/10 text-success",
  accepted: "border-success/30 bg-success/10 text-success",
  rejected: "border-danger/30 bg-danger/10 text-danger",
  revoked: "border-danger/30 bg-danger/10 text-danger",
  expired: "border-border bg-surface-raised text-muted",
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const normalized = status.toLowerCase();
  const style =
    statusStyles[normalized] ??
    "border-border bg-surface-raised text-muted";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide ${style}`}
    >
      {label ?? status}
    </span>
  );
}
