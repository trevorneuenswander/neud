import { DashboardActivityClient } from "@/components/dashboard/DashboardActivityClient";
import type { DashboardActivityItem } from "@/lib/dashboard/types";

type DashboardActivityProps = {
  activity: DashboardActivityItem[];
};

export function DashboardActivity({ activity }: DashboardActivityProps) {
  return <DashboardActivityClient initialActivity={activity} />;
}
