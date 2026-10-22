import { LiveChatClient } from "@/components/live-chat/LiveChatClient";
import { PageHeader } from "@/components/portal/PageHeader";
import { shouldUseLocalData } from "@/lib/local/mode";
import { resolveProjectAccess } from "@/lib/projects/authorization";
import {
  canManageProjectSettings,
  canOperateProjectDisplays,
} from "@/lib/projects/project-permissions";
import { notFound } from "next/navigation";

type PageProps = { params: Promise<{ slug: string }> };

export default async function LiveChatModulePage({ params }: PageProps) {
  const { slug } = await params;

  if (!shouldUseLocalData()) {
    notFound();
  }

  const resolution = await resolveProjectAccess(slug);
  if (resolution.state !== "ready") {
    notFound();
  }

  const role = resolution.access.projectRole;
  const canOperate = canOperateProjectDisplays(role);
  const canConfigure = canManageProjectSettings(role);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Live Chat"
        description="Connect a live chat provider, moderate messages, and drive the Live Chat Overlay."
      />
      <LiveChatClient
        projectSlug={slug}
        canOperate={canOperate}
        canConfigure={canConfigure}
      />
    </div>
  );
}
