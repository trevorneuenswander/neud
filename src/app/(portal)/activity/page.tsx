import { GlobalActivityFullView } from "@/components/activity/GlobalActivityFullView";
import { PageHeader } from "@/components/portal/PageHeader";
import { requireUser } from "@/lib/auth/authorization";

export default async function ActivityPage() {
  await requireUser();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Activity"
        description="Operational events from all projects you can access."
      />
      <GlobalActivityFullView />
    </div>
  );
}
