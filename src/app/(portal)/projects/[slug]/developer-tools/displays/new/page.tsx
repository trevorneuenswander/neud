import { redirect } from "next/navigation";
import { requireDeveloperToolsAccessOrNotFound } from "@/lib/developer-tools/authorization";

type NewDisplayRedirectProps = {
  params: Promise<{ slug: string }>;
};

export default async function NewDisplayRedirectPage({ params }: NewDisplayRedirectProps) {
  const { slug } = await params;
  await requireDeveloperToolsAccessOrNotFound(slug);
  redirect(`/projects/${slug}/displays`);
}
