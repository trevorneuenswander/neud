import { CapabilityModulePlaceholder } from "@/components/projects/CapabilityModulePlaceholder";
import { PageHeader } from "@/components/portal/PageHeader";
import { requireProjectAccess } from "@/lib/projects/authorization";

type PageProps = { params: Promise<{ slug: string }> };

export default async function AutomationModulePage({ params }: PageProps) {
  const { slug } = await params;
  await requireProjectAccess(slug);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Automation"
        description="Automation / Trigger capability module."
      />
      <CapabilityModulePlaceholder capabilityId="automation-trigger" />
    </div>
  );
}
