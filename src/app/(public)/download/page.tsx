import { AppVersion } from "@/components/branding/AppVersion";
import { ReleaseDownloadSection } from "@/components/downloads/ReleaseDownloadSection";
import { WindowsDownloadReleaseNotesLink } from "@/components/downloads/WindowsDownloadLink";
import { PageHeader } from "@/components/portal/PageHeader";
import { Card } from "@/components/ui/Card";
import {
  formatReleaseDate,
  getCurrentNeudRelease,
  getPreviousNeudReleases,
} from "@/lib/releases/neud-releases";
import Link from "next/link";

export default function DownloadPage() {
  const currentRelease = getCurrentNeudRelease();
  const previousReleases = getPreviousNeudReleases();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-10 sm:px-6 lg:px-8">
      <PageHeader
        title="Download NEUD Desktop"
        description="Install the authoritative desktop engine for scraping, control, editing, and publishing."
      />
      <div className="flex items-center justify-end">
        <AppVersion placement="hero" />
      </div>

      <Card className="space-y-4 border-primary/30 p-6 ring-1 ring-primary/20">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Current release
          </p>
          <h2 className="text-xl font-semibold text-foreground">
            NEUD v{currentRelease.version}
          </h2>
          <p className="text-sm text-muted">{currentRelease.summary}</p>
          <p className="text-xs text-muted">
            Released {formatReleaseDate(currentRelease.releaseDate)}
          </p>
        </div>
        <ReleaseDownloadSection release={currentRelease} variant="current" />
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <WindowsDownloadReleaseNotesLink
            href={currentRelease.githubReleaseUrl}
            children="Release notes on GitHub"
          />
        </div>
      </Card>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Previous versions</h2>
          <p className="text-sm text-muted">
            Older installers remain on GitHub Releases for rollback. Downloads open immutable
            release assets — not copies hosted on Vercel.
          </p>
        </div>
        <div className="space-y-4">
          {previousReleases.map((release) => (
            <Card key={release.version} className="space-y-3 p-6">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                  Previous version
                </p>
                <h3 className="text-base font-semibold text-foreground">
                  NEUD v{release.version}
                </h3>
                <p className="text-sm text-muted">{release.summary}</p>
              </div>
              <ReleaseDownloadSection release={release} variant="previous" />
            </Card>
          ))}
        </div>
      </section>

      <Link
        href="/login"
        className="block text-center text-sm font-medium text-primary hover:underline"
      >
        Already installed? Log in to the portal
      </Link>
    </div>
  );
}
