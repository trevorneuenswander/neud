import { Card } from "@/components/ui/Card";
import { PageSection } from "@/components/portal/PageSection";
import type { SystemStatusItem } from "@/lib/portal/system-status";

type DashboardSystemStatusProps = {
  items: SystemStatusItem[];
};

const stateColors = {
  connected: "text-success",
  unavailable: "text-danger",
  "not-configured": "text-muted",
};

export function DashboardSystemStatus({ items }: DashboardSystemStatusProps) {
  return (
    <PageSection title="System Status">
      <Card>
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <li
              key={item.label}
              className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
            >
              <span className="text-sm text-foreground">{item.label}</span>
              <span className={`text-sm font-medium ${stateColors[item.state]}`}>
                {item.value}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </PageSection>
  );
}
