import Link from "next/link";
import { getAuthClaims } from "@/lib/auth/session";

export async function PublicHeader() {
  const claims = await getAuthClaims();
  const isLoggedIn = claims !== null;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="cursor-pointer text-sm font-semibold tracking-tight text-foreground sm:text-base"
        >
          HMG Graphics Server
        </Link>
        <nav className="flex items-center gap-4 sm:gap-6" aria-label="Public">
          {isLoggedIn ? (
            <Link
              href="/dashboard"
              className="text-sm font-medium text-muted transition-colors hover:text-foreground"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm font-medium text-muted transition-colors hover:text-foreground"
              >
                Login
              </Link>
              <Link
                href="/request-access"
                className="text-sm font-medium text-muted transition-colors hover:text-foreground"
              >
                Request Access
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
