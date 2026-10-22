import { getDesktopAPI } from "@/lib/desktop/client";
import { localFetch } from "@/lib/local/api";
import { resolveDesktopLocalApiConfig } from "@/lib/local/local-api-origin";
import type { EditableGraphicSchema } from "@/lib/editor/editable-graphic-types";

export type {
  EditableDataBinding,
  EditableGraphicSchema,
  EditableLayer,
  EditableLayerType,
  EditableOverflowMode,
  EditableTextAlign,
} from "@/lib/editor/editable-graphic-types";

type EditableSchemaResult = {
  result: {
    displayId: string;
    projectId: string;
    projectSlug: string;
    name: string;
    slug: string;
    settings: Record<string, unknown>;
    editableGraphicSchema: EditableGraphicSchema;
    supportsGraphicEditor: boolean;
  };
};

type EditableSchemaSaveResult = {
  result: {
    displayId: string;
    settings: Record<string, unknown>;
    editableGraphicSchema: EditableGraphicSchema;
    published: boolean;
  };
};

let displayAssetApiOrigin: string | null = null;

/** Cache local API origin so display asset URLs resolve in the editor window. */
export function setDisplayAssetApiOrigin(origin: string | null) {
  displayAssetApiOrigin = origin ? origin.replace(/\/$/, "") : null;
}

export async function primeDisplayAssetUrlBase(): Promise<string | null> {
  try {
    const config = await resolveDesktopLocalApiConfig();
    setDisplayAssetApiOrigin(config.baseUrl);
    return config.baseUrl;
  } catch {
    return null;
  }
}

function displayAssetApiPath(
  projectSlug: string,
  displayId: string,
  relativePath: string,
): string {
  const assetKey = relativePath.replace(/^assets\//, "");
  return `/api/projects/${encodeURIComponent(projectSlug)}/developer-tools/displays/${encodeURIComponent(displayId)}/assets/${encodeURIComponent(assetKey)}`;
}

/**
 * Prefer desktop IPC from the Graphic Editor BrowserWindow so Save Draft does
 * not depend on a relative fetch against a mismatched origin.
 */
export async function localGetEditableGraphicSchema(
  projectSlug: string,
  displayId: string,
): Promise<EditableSchemaResult> {
  const desktop = getDesktopAPI();
  if (desktop?.editor?.getEditableSchema) {
    const payload = await desktop.editor.getEditableSchema({ projectSlug, displayId });
    return payload as unknown as EditableSchemaResult;
  }
  return localFetch<EditableSchemaResult>(
    `/api/projects/${encodeURIComponent(projectSlug)}/developer-tools/displays/${encodeURIComponent(displayId)}/editable-schema`,
  );
}

export async function localSaveEditableGraphicSchema(
  projectSlug: string,
  displayId: string,
  schema: EditableGraphicSchema,
): Promise<EditableSchemaSaveResult> {
  const desktop = getDesktopAPI();
  console.info("[neud-editor-save] renderer localSaveEditableGraphicSchema", {
    projectSlug,
    displayId,
    viaIpc: Boolean(desktop?.editor?.saveEditableSchema),
    layerCount: schema.layers?.length ?? 0,
  });
  if (desktop?.editor?.saveEditableSchema) {
    const payload = await desktop.editor.saveEditableSchema({
      projectSlug,
      displayId,
      editableGraphicSchema: schema,
    });
    console.info("[neud-editor-save] renderer localSaveEditableGraphicSchema ipc ok", {
      projectSlug,
      displayId,
    });
    return payload as unknown as EditableSchemaSaveResult;
  }
  console.info("[neud-editor-save] renderer localSaveEditableGraphicSchema via localFetch", {
    projectSlug,
    displayId,
  });
  return localFetch<EditableSchemaSaveResult>(
    `/api/projects/${encodeURIComponent(projectSlug)}/developer-tools/displays/${encodeURIComponent(displayId)}/editable-schema`,
    {
      method: "PUT",
      body: JSON.stringify({ editableGraphicSchema: schema }),
      timeoutMs: 30_000,
    },
  );
}

/** Import PNG/JPG (or other image) into display assets. Returns relative path. */
export async function localImportDisplayAsset(
  projectSlug: string,
  displayId: string,
  input: { fileName: string; mimeType: string; dataBase64: string },
) {
  const desktop = getDesktopAPI();
  if (desktop?.editor?.importDisplayAsset) {
    return desktop.editor.importDisplayAsset({
      projectSlug,
      displayId,
      ...input,
    }) as Promise<{
      result: {
        assetId: string;
        relativePath: string;
        fileName: string;
        url: string;
      };
    }>;
  }
  return localFetch<{
    result: {
      assetId: string;
      relativePath: string;
      fileName: string;
      url: string;
    };
  }>(
    `/api/projects/${encodeURIComponent(projectSlug)}/developer-tools/displays/${encodeURIComponent(displayId)}/assets`,
    {
      method: "POST",
      body: JSON.stringify(input),
      timeoutMs: 60_000,
    },
  );
}

export function displayAssetUrl(
  projectSlug: string,
  displayId: string,
  relativePath: string,
): string {
  const path = displayAssetApiPath(projectSlug, displayId, relativePath);
  if (displayAssetApiOrigin) {
    return `${displayAssetApiOrigin}${path}`;
  }
  return path;
}

export async function resolveDisplayAssetUrl(
  projectSlug: string,
  displayId: string,
  relativePath: string,
): Promise<string> {
  if (!displayAssetApiOrigin) {
    await primeDisplayAssetUrlBase();
  }
  return displayAssetUrl(projectSlug, displayId, relativePath);
}

export const LOCAL_SEMA_EDITOR_SAMPLE_SCHEDULE = {
  now: {
    title: "Main Stage Keynote",
    description: "Opening remarks and product showcase",
  },
  next: {
    title: "EV Technology Forum",
    description: "Battery breakthroughs and charging networks",
  },
  later: {
    title: "Aftermarket Innovation",
    description: "New tools and accessories for builders",
  },
};
