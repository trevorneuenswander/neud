import { redirect } from "next/navigation";
import { requireDeveloperToolsAccessOrNotFound } from "@/lib/developer-tools/authorization";

type DeveloperToolsRedirectProps = {
  params: Promise<{ slug: string }>;
};

export default async function DeveloperToolsIndexPage({
  params,
}: DeveloperToolsRedirectProps) {
  const { slug } = await params;
  await requireDeveloperToolsAccessOrNotFound(slug);
  redirect(`/projects/${slug}/data-engines`);
}
