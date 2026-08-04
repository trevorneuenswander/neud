import { redirect } from "next/navigation";
import { DesktopLoginPage } from "@/components/auth/DesktopLoginPage";
import { MarketingHomePage } from "@/components/marketing/MarketingHomePage";
import { resolveLocalAuthenticatedPrincipal } from "@/lib/local/auth.server";
import { shouldUseLocalData } from "@/lib/local/mode";
import { BROAD_ARROW_DEFAULT_PROJECT_SLUG } from "@/lib/projects/default-project";
import { resolveAuthenticatedLandingPath } from "@/lib/routing/startup-paths";

export default async function RootPage() {
  if (shouldUseLocalData()) {
    const principal = await resolveLocalAuthenticatedPrincipal();
    if (principal) {
      redirect(
        resolveAuthenticatedLandingPath(true, {
          defaultProjectSlug: BROAD_ARROW_DEFAULT_PROJECT_SLUG,
        }),
      );
    }

    return <DesktopLoginPage />;
  }

  return <MarketingHomePage />;
}
