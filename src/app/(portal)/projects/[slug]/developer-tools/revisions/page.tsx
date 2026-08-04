import { redirect } from "next/navigation";
import { requireDeveloperToolsAccessOrNotFound } from "@/lib/developer-tools/authorization";

type RevisionsRedirectProps = {
  params: Promise<{ slug: string }>;
};

export default async function RevisionsRedirectPage({ params }: RevisionsRedirectProps) {
  const { slug } = await params;
  await requireDeveloperToolsAccessOrNotFound(slug);
  redirect(`/projects/${slug}/data-engines`);
}
