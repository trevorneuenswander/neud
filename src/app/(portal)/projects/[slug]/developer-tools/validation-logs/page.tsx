import { redirect } from "next/navigation";
import { requireDeveloperToolsAccessOrNotFound } from "@/lib/developer-tools/authorization";

type ValidationLogsRedirectProps = {
  params: Promise<{ slug: string }>;
};

export default async function ValidationLogsRedirectPage({
  params,
}: ValidationLogsRedirectProps) {
  const { slug } = await params;
  await requireDeveloperToolsAccessOrNotFound(slug);
  redirect(`/projects/${slug}/data-engines`);
}
