import { StatCard } from "@/components/ui/StatCard";

type DashboardSummaryProps = {
  pendingRequests: number | null;
};

export function DashboardSummary({ pendingRequests }: DashboardSummaryProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Projects"
        value="—"
        detail="Not configured"
        state="unavailable"
      />
      <StatCard
        label="Online Displays"
        value="—"
        detail="Not configured"
        state="unavailable"
      />
      <StatCard
        label="Running Workers"
        value="—"
        detail="Not configured"
        state="unavailable"
      />
      {pendingRequests !== null ? (
        <StatCard
          label="Pending Access Requests"
          value={String(pendingRequests)}
          detail="Requires review"
          state={pendingRequests > 0 ? "active" : "default"}
        />
      ) : null}
    </div>
  );
}
