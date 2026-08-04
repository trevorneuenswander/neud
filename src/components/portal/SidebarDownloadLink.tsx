import Link from "next/link";
import { HOSTED_PORTAL_PATHS } from "@/lib/routing/hosted-routes";

export function SidebarDownloadLink() {
  return (
    <Link
      href={HOSTED_PORTAL_PATHS.download}
      className="flex w-full items-center justify-center rounded-md border border-border bg-surface-raised px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface"
    >
      Download Desktop
    </Link>
  );
}
