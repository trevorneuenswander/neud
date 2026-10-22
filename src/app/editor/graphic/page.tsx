import { GraphicEditorClient } from "@/components/editor/GraphicEditorClient";

type GraphicEditorPageProps = {
  searchParams: Promise<{
    projectId?: string;
    displayId?: string;
    projectSlug?: string;
  }>;
};

export default async function GraphicEditorPage({ searchParams }: GraphicEditorPageProps) {
  const params = await searchParams;
  const projectId = params.projectId?.trim() ?? "";
  const displayId = params.displayId?.trim() ?? "";
  const projectSlug = params.projectSlug?.trim() || "sema";

  if (!projectId || !displayId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 p-6 text-red-300">
        Missing projectId or displayId.
      </div>
    );
  }

  return (
    <GraphicEditorClient
      projectId={projectId}
      displayId={displayId}
      projectSlug={projectSlug}
    />
  );
}
