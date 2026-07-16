import Link from "next/link";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { isAdmin } from "@/lib/auth/authorization";
import { getAuthClaims } from "@/lib/auth/session";

export async function SiteHeader() {
  const claims = await getAuthClaims();
  const isLoggedIn = claims !== null;
  const showAdminLink = isLoggedIn && (await isAdmin());

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-base"
        >
          HMG Graphics Server
        </Link>
        <nav className="flex items-center gap-4 sm:gap-6">
          {isLoggedIn ? (
            <>
              <Link
                href="/dashboard"
                className="text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
              >
                Dashboard
              </Link>
              <Link
                href="/projects"
                className="text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
              >
                Projects
              </Link>
              {showAdminLink ? (
                <Link
                  href="/admin/access-requests"
                  className="text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
                >
                  Access Requests
                </Link>
              ) : null}
              <LogoutButton />
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
              >
                Login
              </Link>
              <Link
                href="/request-access"
                className="text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
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
