import { CapabilityModulePlaceholder } from "@/components/projects/CapabilityModulePlaceholder";
import { PageHeader } from "@/components/portal/PageHeader";
import { requireProjectAccess } from "@/lib/projects/authorization";

type PageProps = { params: Promise<{ slug: string }> };

export default async function WeatherModulePage({ params }: PageProps) {
  const { slug } = await params;
  await requireProjectAccess(slug);
  return (
    <div className="space-y-6">
      <PageHeader title="Weather" description="Weather capability module." />
      <CapabilityModulePlaceholder capabilityId="weather" />
    </div>
  );
}
