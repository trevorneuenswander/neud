import { RequestAccessForm } from "@/components/access-requests/RequestAccessForm";
import { PublicPage } from "@/components/layout/PublicPage";
import { redirectIfAuthenticated } from "@/lib/auth/session";

export default async function RequestAccessPage() {
  await redirectIfAuthenticated();

  return (
    <PublicPage
      title="Request Access"
      description="Tell us about yourself and how your organization plans to use HMG Graphics Server."
      showLogo
      maxWidth="lg"
    >
      <RequestAccessForm />
    </PublicPage>
  );
}
