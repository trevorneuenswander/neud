import { Suspense } from "react";
import { LoginForm } from "@/components/auth/LoginForm";
import { PostUpdateSignInNotice } from "@/components/auth/PostUpdateSignInNotice";
import { AppVersion } from "@/components/branding/AppVersion";
import { NeudLogo } from "@/components/branding/NeudLogo";
import { getDefaultAuthenticatedPath } from "@/lib/projects/default-project";

export function DesktopLoginPage() {
  const nextPath = getDefaultAuthenticatedPath();

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center space-y-6 text-center">
          <div className="flex flex-col items-center gap-2">
            <NeudLogo size="hero" showTagline href={null} />
            <AppVersion placement="hero" />
          </div>
          <p className="text-base leading-7 text-muted">
            Sign in to start scraping, controlling, and publishing live graphics from this desktop.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface-raised p-6 shadow-sm">
          <Suspense fallback={null}>
            <PostUpdateSignInNotice />
          </Suspense>
          <LoginForm nextPath={nextPath} />
        </div>
      </div>
    </div>
  );
}
