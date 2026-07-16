import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/portal/PageHeader";
import { requireUser } from "@/lib/auth/authorization";

export default async function SettingsPage() {
  await requireUser();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Settings"
        description="Account and platform preferences."
      />
      <EmptyState
        title="Settings not yet available"
        description="Account settings and preferences will be configurable here in a future phase."
      />
    </div>
  );
}
