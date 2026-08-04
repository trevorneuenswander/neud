import { redirect } from "next/navigation";
import { requireDeveloperToolsAccessOrNotFound } from "@/lib/developer-tools/authorization";

type ScraperDeveloperToolsRedirectProps = {
  params: Promise<{ slug: string }>;
};

export default async function ScraperDeveloperToolsRedirectPage({
  params,
}: ScraperDeveloperToolsRedirectProps) {
  const { slug } = await params;
  await requireDeveloperToolsAccessOrNotFound(slug);
  redirect(`/projects/${slug}/data-engines`);
}
