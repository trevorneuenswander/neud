import Link from "next/link";
import { NeudLogo } from "@/components/branding/NeudLogo";
import { getAuthClaims } from "@/lib/auth/session";

export async function PublicHeader() {
  const claims = await getAuthClaims();
  const isLoggedIn = claims !== null;

  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <NeudLogo href={isLoggedIn ? "/dashboard" : "/"} size="sm" />
        {isLoggedIn ? (
          <nav aria-label="Public">
            <Link
              href="/dashboard"
              className="text-sm font-medium text-muted transition-colors hover:text-foreground"
            >
              Dashboard
            </Link>
          </nav>
        ) : null}
      </div>
    </header>
  );
}
