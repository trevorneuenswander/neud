import Link from "next/link";
import { LoginForm } from "@/components/auth/LoginForm";
import { AppVersion } from "@/components/branding/AppVersion";
import { NeudLogo } from "@/components/branding/NeudLogo";
import { Alert } from "@/components/ui/Alert";
import { getPageMessage } from "@/lib/auth/messages";
import { DEFAULT_REDIRECT, getSafeRedirectPath } from "@/lib/auth/redirect";
import { getSafeHostedRedirectPath } from "@/lib/auth/hosted-redirect";
import { redirectIfAuthenticated } from "@/lib/auth/session";

type LoginPageProps = {
  searchParams: Promise<{
    next?: string;
    error?: string;
    message?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextPath = getSafeHostedRedirectPath(params.next, DEFAULT_REDIRECT);
  await redirectIfAuthenticated(nextPath);
  const errorMessage = getPageMessage(params.error);
  const successMessage = getPageMessage(params.message);

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center space-y-6 text-center">
          <div className="flex flex-col items-center gap-2">
            <NeudLogo size="hero" showTagline href="/" />
            <AppVersion placement="hero" />
          </div>
          <p className="text-base leading-7 text-muted">
            Sign in to the NEUD cloud portal to watch published displays.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface-raised p-6 shadow-sm">
          {errorMessage ? <Alert variant="error">{errorMessage}</Alert> : null}
          {successMessage ? <Alert variant="success">{successMessage}</Alert> : null}
          <div className={errorMessage || successMessage ? "mt-4" : ""}>
            <LoginForm nextPath={nextPath} />
          </div>
          <p className="mt-4 text-center text-sm text-muted">
            Need the desktop app?{" "}
            <Link href="/download" className="font-medium text-primary hover:underline">
              Download NEUD Desktop
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
