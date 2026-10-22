import { CapabilityModulePlaceholder } from "@/components/projects/CapabilityModulePlaceholder";
import { PageHeader } from "@/components/portal/PageHeader";
import { requireProjectAccess } from "@/lib/projects/authorization";

type PageProps = { params: Promise<{ slug: string }> };

export default async function TimerModulePage({ params }: PageProps) {
  const { slug } = await params;
  await requireProjectAccess(slug);
  return (
    <div className="space-y-6">
      <PageHeader title="Timer" description="Timer capability module." />
      <CapabilityModulePlaceholder capabilityId="timer" />
    </div>
  );
}
