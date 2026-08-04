import { redirect } from "next/navigation";
import { requireDeveloperToolsAccessOrNotFound } from "@/lib/developer-tools/authorization";

type DisplayEditorRedirectProps = {
  params: Promise<{ slug: string; displayId: string }>;
};

export default async function DisplayEditorRedirectPage({
  params,
}: DisplayEditorRedirectProps) {
  const { slug } = await params;
  await requireDeveloperToolsAccessOrNotFound(slug);
  redirect(`/projects/${slug}/displays`);
}
