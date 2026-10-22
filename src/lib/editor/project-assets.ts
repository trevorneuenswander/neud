/**
 * Project Asset Library foundation.
 * Assets use stable project/package-relative identity — never absolute local paths
 * in graphic schema.
 */

export type ProjectAssetKind = "png" | "jpg" | "jpeg" | "webp" | "svg";

export type ProjectAssetCategory =
  | "logo"
  | "image"
  | "photo"
  | "background"
  | "icon"
  | "other";

export const PROJECT_ASSET_CATEGORIES: { id: ProjectAssetCategory; label: string }[] = [
  { id: "logo", label: "Logos" },
  { id: "image", label: "Images" },
  { id: "photo", label: "Photos" },
  { id: "background", label: "Backgrounds" },
  { id: "icon", label: "Icons" },
  { id: "other", label: "Other" },
];

export type ProjectAsset = {
  /** Stable id relative to the project package */
  id: string;
  name: string;
  kind: ProjectAssetKind;
  category: ProjectAssetCategory;
  /** Package-relative path e.g. assets/logos/sema.svg */
  relativePath: string;
  mimeType: string;
  width?: number;
  height?: number;
  createdAt?: string;
};

export function assetKindFromFilename(filename: string): ProjectAssetKind | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".png")) return "png";
  if (lower.endsWith(".jpg")) return "jpg";
  if (lower.endsWith(".jpeg")) return "jpeg";
  if (lower.endsWith(".webp")) return "webp";
  if (lower.endsWith(".svg")) return "svg";
  return null;
}

export function isSupportedImageAsset(filename: string): boolean {
  return assetKindFromFilename(filename) != null;
}

/** Schema must store assetId / relativePath — never absolute filesystem paths. */
export function assertNoAbsoluteAssetPath(pathOrId: string): boolean {
  if (!pathOrId) return true;
  if (pathOrId.startsWith("/") && !pathOrId.startsWith("/assets/")) return false;
  if (/^[a-zA-Z]:\\/.test(pathOrId)) return false;
  if (pathOrId.startsWith("file:")) return false;
  return true;
}

export function upsertProjectAsset(
  assets: ProjectAsset[],
  asset: ProjectAsset,
): ProjectAsset[] {
  const without = assets.filter((entry) => entry.id !== asset.id);
  return [...without, asset];
}

export function assetCategoryFromFilename(filename: string): ProjectAssetCategory {
  const lower = filename.toLowerCase();
  if (lower.includes("logo")) return "logo";
  if (lower.includes("icon")) return "icon";
  if (lower.includes("bg") || lower.includes("background")) return "background";
  if (lower.includes("photo")) return "photo";
  return "image";
}

export function createProjectAssetId(filename: string): string {
  const safe = filename
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return `asset-${Date.now().toString(36)}-${safe || "file"}`;
}
