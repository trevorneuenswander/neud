type ConnectionStatusPillProps = {
  status: "live" | "offline";
  title?: string;
};

export function ConnectionStatusPill({ status, title }: ConnectionStatusPillProps) {
  const isLive = status === "live";
  return (
    <span
      className={`rounded-full border px-4 py-1.5 text-sm font-semibold uppercase tracking-wide ${
        isLive
          ? "border-success/40 bg-success/10 text-success"
          : "border-border bg-surface text-muted"
      }`}
      title={
        title ??
        (isLive
          ? "LIVE — Operational and connected."
          : "OFFLINE — Not currently operational.")
      }
    >
      {isLive ? "Live" : "Offline"}
    </span>
  );
}
