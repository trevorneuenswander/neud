import { EngineDetailContent } from "@/components/data-engines/EngineDetailContent";

type EngineDetailPageProps = {
  params: Promise<{ slug: string; engineId: string }>;
};

export default async function EngineDetailPage({ params }: EngineDetailPageProps) {
  const { slug, engineId } = await params;

  return (
    <EngineDetailContent projectSlug={slug} engineId={engineId} showPageHeader />
  );
}
