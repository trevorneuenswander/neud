import { DisplayLivePageClient } from "@/components/displays/DisplayLivePageClient";
import { BROAD_ARROW_SLUG_RENDERER_DEFAULTS } from "@/lib/displays/broad-arrow/renderer-keys";
import { resolveDisplayViewMode } from "@/lib/displays/display-view-mode";

type DisplayLivePageProps = {
  params: Promise<{ projectId: string; slug: string }>;
  searchParams: Promise<{ preview?: string; poll?: string; mode?: string }>;
};

export default async function DisplayLivePage({
  params,
  searchParams,
}: DisplayLivePageProps) {
  const { projectId, slug } = await params;
  const query = await searchParams;
  const viewMode = resolveDisplayViewMode(query);
  const refreshRateMs = query.poll ? Number(query.poll) : 5000;

  return (
    <DisplayLivePageClient
      projectId={projectId}
      slug={slug}
      displayKey={slug}
      settings={
        slug in BROAD_ARROW_SLUG_RENDERER_DEFAULTS
          ? { rendererKey: BROAD_ARROW_SLUG_RENDERER_DEFAULTS[slug] }
          : null
      }
      refreshRateMs={Number.isFinite(refreshRateMs) ? refreshRateMs : 5000}
      viewMode={viewMode}
    />
  );
}
