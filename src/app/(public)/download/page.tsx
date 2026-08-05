import { AppVersion } from "@/components/branding/AppVersion";
import {
  WindowsDownloadButton,
  WindowsDownloadReleaseNotesLink,
} from "@/components/downloads/WindowsDownloadLink";
import { PageHeader } from "@/components/portal/PageHeader";
import { Card } from "@/components/ui/Card";
import Link from "next/link";
import {
  getVersionedWindowsInstallerFilename,
} from "@/lib/downloads/windows-installer";
import packageJson from "../../../../package.json";

export default function DownloadPage() {
  const installerFilename = getVersionedWindowsInstallerFilename(packageJson.version);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-10 sm:px-6 lg:px-8">
      <PageHeader
        title="Download NEUD Desktop"
        description="Install the authoritative desktop engine for scraping, control, editing, and publishing."
      />
      <Card className="space-y-4 p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Windows Alpha</h2>
            <p className="text-sm text-muted">
              Official Windows installer from GitHub Releases ({installerFilename}).
            </p>
          </div>
          <AppVersion placement="hero" />
        </div>
        <p className="text-sm text-muted">
          NEUD Desktop includes bundled Chrome for Testing, local SQLite storage, and the
          authoritative Broad Arrow workflow. Windows SmartScreen may warn on unsigned Alpha
          builds until code signing is configured.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <WindowsDownloadButton />
          <WindowsDownloadReleaseNotesLink />
        </div>
        <Link href="/login" className="text-sm font-medium text-primary hover:underline">
          Already installed? Log in to the portal
        </Link>
      </Card>
      <Card className="space-y-3 p-6">
        <h2 className="text-base font-semibold text-foreground">macOS</h2>
        <p className="text-sm text-muted">Coming in Beta.</p>
      </Card>
    </div>
  );
}
