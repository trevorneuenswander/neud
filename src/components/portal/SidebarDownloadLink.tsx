import Link from "next/link";

/**
 * Authenticated portal entry to the download page.
 * Navigates to /download so the user chooses a platform — never auto-downloads an installer.
 */
export function SidebarDownloadLink() {
  return (
    <Link
      href="/download"
      className="flex w-full items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 active:bg-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      Get NEUD
    </Link>
  );
}
