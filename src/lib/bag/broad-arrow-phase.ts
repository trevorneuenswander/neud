export const BROAD_ARROW_CANONICAL_PROJECT = {
  name: "Broad Arrow Auctions",
  slug: "broad-arrow-auctions",
  projectType: "bag-graphics",
} as const;

export function isBroadArrowCanonicalProject(project: { slug: string }): boolean {
  return project.slug === BROAD_ARROW_CANONICAL_PROJECT.slug;
}
