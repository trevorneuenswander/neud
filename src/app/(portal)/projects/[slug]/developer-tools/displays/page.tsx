import { redirect } from "next/navigation";
import { requireDeveloperToolsAccessOrNotFound } from "@/lib/developer-tools/authorization";

type DisplaysDeveloperToolsRedirectProps = {
  params: Promise<{ slug: string }>;
};

export default async function DisplaysDeveloperToolsRedirectPage({
  params,
}: DisplaysDeveloperToolsRedirectProps) {
  const { slug } = await params;
  await requireDeveloperToolsAccessOrNotFound(slug);
  redirect(`/projects/${slug}/displays`);
}
