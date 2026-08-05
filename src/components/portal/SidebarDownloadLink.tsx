import { WindowsDownloadLink } from "@/components/downloads/WindowsDownloadLink";

export function SidebarDownloadLink() {
  return (
    <WindowsDownloadLink className="flex w-full items-center justify-center rounded-md border border-border bg-surface-raised px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface">
      Download Desktop
    </WindowsDownloadLink>
  );
}
