import type { AuthLicenseManager } from "./auth-license-manager";
import type { DeveloperToolsService } from "./developer-tools-service";

export function persistEditableGraphicSchema(input: {
  auth: AuthLicenseManager;
  developerTools: DeveloperToolsService;
  projectSlug: string;
  displayId: string;
  schema: unknown;
}) {
  if (!input.projectSlug.trim() || !input.displayId.trim()) {
    throw new Error("Project slug and display are required.");
  }
  if (!input.schema || typeof input.schema !== "object") {
    throw new Error("Editable graphic schema is required.");
  }
  if (!input.auth.isAccessAllowed()) {
    throw new Error("Sign in to save the graphic editor draft.");
  }
  console.info("[neud-editor-save] persistEditableGraphicSchema", {
    projectSlug: input.projectSlug,
    displayId: input.displayId,
  });
  const result = input.developerTools.saveEditableGraphicSchema(
    input.projectSlug,
    input.displayId,
    input.schema,
  );
  console.info("[neud-editor-save] persistEditableGraphicSchema ok", {
    projectSlug: input.projectSlug,
    displayId: input.displayId,
    layerCount: Array.isArray(
      (result.editableGraphicSchema as { layers?: unknown[] })?.layers,
    )
      ? (result.editableGraphicSchema as { layers: unknown[] }).layers.length
      : null,
  });
  return result;
}
