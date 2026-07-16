import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/portal/PageHeader";
import { requireAdmin } from "@/lib/auth/authorization";

export default async function ActivityPage() {
  await requireAdmin();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Activity"
        description="Platform-wide operational events and audit log."
      />
      <EmptyState
        title="Activity logging not yet implemented"
        description="Operational events such as logins, access approvals, and Project changes will appear here once audit logging is added."
      />
    </div>
  );
}
