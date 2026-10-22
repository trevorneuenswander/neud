/**
 * Built-in project package catalog for NEUD v0.3.0.
 * Cloud directory merges with this for authorized projects.
 * Package versions are integers, independent of NEUD app semver.
 */

export const BROAD_ARROW_PACKAGE_KEY = "broad-arrow-auctions";
export const BROAD_ARROW_PACKAGE_BASELINE_VERSION = 1;

export const SEMA_PACKAGE_KEY = "sema";
export const SEMA_PACKAGE_BASELINE_VERSION = 8;

export type BuiltinPackageCatalogEntry = {
  projectKey: string;
  slug: string;
  name: string;
  projectType: string;
  availableVersion: number;
  description: string;
  /** When true, existing local project rows migrate to installed package automatically. */
  legacyAutoMigrate: boolean;
};

export const BUILTIN_PROJECT_PACKAGE_CATALOG: BuiltinPackageCatalogEntry[] = [
  {
    projectKey: BROAD_ARROW_PACKAGE_KEY,
    slug: "broad-arrow-auctions",
    name: "Broad Arrow Auctions",
    projectType: "bag-graphics",
    availableVersion: BROAD_ARROW_PACKAGE_BASELINE_VERSION,
    description:
      "Broad Arrow auction graphics powered by the BAG auction scraper.",
    legacyAutoMigrate: true,
  },
  {
    projectKey: SEMA_PACKAGE_KEY,
    slug: "sema",
    name: "SEMA",
    projectType: "sema-schedule",
    availableVersion: SEMA_PACKAGE_BASELINE_VERSION,
    description:
      "SEMA schedule graphics driven by Google Sheets with local controller backup.",
    legacyAutoMigrate: false,
  },
];

export function getBuiltinCatalogEntry(
  slug: string,
): BuiltinPackageCatalogEntry | null {
  return (
    BUILTIN_PROJECT_PACKAGE_CATALOG.find((entry) => entry.slug === slug) ?? null
  );
}
