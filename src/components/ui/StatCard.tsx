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

type StatBreakdownItem = {
  value: string;
  label: string;
};

type StatBreakdownCardProps = {
  title: string;
  items: StatBreakdownItem[];
};

export function StatBreakdownCard({ title, items }: StatBreakdownCardProps) {
  return (
    <Card>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{title}</p>
      <div className="mt-2 grid grid-cols-3 gap-3">
        {items.map((item) => (
          <div key={item.label}>
            <p className="text-2xl font-semibold tabular-nums text-foreground">
              {item.value}
            </p>
            <p className="mt-1 text-xs text-muted">{item.label}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
