import type { DisplayDefinition } from "@/lib/displays/registry";
import type { ProjectDisplaySource } from "@/lib/developer-tools/types";
import type { CreatedDisplayPayload } from "@/lib/local/displays-api";
import { resolveRendererKey } from "@/lib/displays/broad-arrow/resolve-renderer-key";

export type DisplayListItem =
  | {
      kind: "registry";
      id: string;
      persistId: string;
      refreshRateMs: number;
      displayWidth: number;
      displayHeight: number;
      activeVersionNumber: number | null;
      activeVersionCreatedAt: string | null;
      cardDescription: string | null;
      display: DisplayDefinition;
      developerDisplay: ProjectDisplaySource | null;
    }
  | {
      kind: "custom";
      id: string;
      persistId: string;
      refreshRateMs: number;
      displayWidth: number;
      displayHeight: number;
      activeVersionNumber: number | null;
      activeVersionCreatedAt: string | null;
      rendererKey: string | null;
      display: ProjectDisplaySource;
    };

export function buildCustomDisplayListItem(
  display: CreatedDisplayPayload,
  settings?: Record<string, unknown> | null,
): Extract<DisplayListItem, { kind: "custom" }> {
  const resolvedSourceType =
    display.sourceType === "project-video" || settings?.sourceType === "project-video"
      ? "project-video"
      : display.sourceType;
  const customDisplay: ProjectDisplaySource = {
    id: display.id,
    projectId: display.projectId,
    name: display.name,
    slug: display.slug,
    displayKey: display.displayKey,
    description: display.description,
    sourceType: resolvedSourceType,
    enabled: display.enabled,
    archived: display.archived,
    draftHtml: null,
    draftCss: null,
    draftJavascript: null,
    publishedRevisionId: display.publishedRevisionId,
    isDirty: false,
    updatedAt: display.activeVersion.createdAt,
    updatedBy: null,
    draftSavedAt: null,
    settings: {
      ...(settings && typeof settings === "object" ? settings : {}),
      sourceType: resolvedSourceType,
      ...(display.mediaAssetId ? { mediaAssetId: display.mediaAssetId } : {}),
    },
  };

  return {
    kind: "custom",
    id: display.displayKey,
    persistId: display.id,
    refreshRateMs: display.refreshRateMs,
    displayWidth: display.displayWidth,
    displayHeight: display.displayHeight,
    activeVersionNumber: display.activeVersion.versionNumber,
    activeVersionCreatedAt: display.activeVersion.createdAt,
    rendererKey: resolveRendererKey(display.displayKey, settings),
    display: customDisplay,
  };
}
