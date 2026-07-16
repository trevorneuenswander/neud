import { Card } from "@/components/ui/Card";

type StatCardProps = {
  label: string;
  value: string;
  detail?: string;
  state?: "default" | "unavailable" | "active";
};

const stateClasses = {
  default: "text-foreground",
  unavailable: "text-muted",
  active: "text-foreground",
};

export function StatCard({
  label,
  value,
  detail,
  state = "default",
}: StatCardProps) {
  return (
    <Card>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${stateClasses[state]}`}>
        {value}
      </p>
      {detail ? (
        <p className="mt-1 text-xs text-muted">{detail}</p>
      ) : null}
    </Card>
  );
}
