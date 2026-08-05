import { ApplicationUpdatesSection } from "@/components/settings/ApplicationUpdatesSection";
import { DataBackupsSection } from "@/components/settings/DataBackupsSection";
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
      <ApplicationUpdatesSection />
      <DataBackupsSection />
    </div>
  );
}
