import { notFound, redirect } from "next/navigation";
import { getHostedProjectPortalSummary } from "@/lib/hosted/portal-queries";
import { HOSTED_PORTAL_PATHS } from "@/lib/routing/hosted-routes";

type HostedProjectPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function HostedProjectPage({ params }: HostedProjectPageProps) {
  const { slug } = await params;
  const summary = await getHostedProjectPortalSummary(slug);
  if (!summary) {
    notFound();
  }

  redirect(HOSTED_PORTAL_PATHS.projectDisplays(slug));
}
