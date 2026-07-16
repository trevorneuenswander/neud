import { LoginForm } from "@/components/auth/LoginForm";
import { PublicPage } from "@/components/layout/PublicPage";
import { Alert } from "@/components/ui/Alert";
import { getPageMessage } from "@/lib/auth/messages";
import { getSafeRedirectPath } from "@/lib/auth/redirect";
import { redirectIfAuthenticated } from "@/lib/auth/session";

type LoginPageProps = {
  searchParams: Promise<{
    next?: string;
    error?: string;
    message?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  await redirectIfAuthenticated();

  const params = await searchParams;
  const nextPath = getSafeRedirectPath(params.next, "/dashboard");
  const errorMessage = getPageMessage(params.error);
  const successMessage = getPageMessage(params.message);

  return (
    <PublicPage
      title="Log in"
      description="Sign in to access the HMG Graphics Server portal."
      showLogo
    >
      {errorMessage ? <Alert variant="error">{errorMessage}</Alert> : null}
      {successMessage ? <Alert variant="success">{successMessage}</Alert> : null}
      <div className={errorMessage || successMessage ? "mt-4" : ""}>
        <LoginForm nextPath={nextPath} />
      </div>
    </PublicPage>
  );
}
