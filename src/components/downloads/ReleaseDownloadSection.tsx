import type { NeudReleaseEntry } from "@/lib/releases/neud-releases";
import {
  formatMacSigningLabel,
  formatReleaseDate,
} from "@/lib/releases/neud-releases";
import { MacDownloadLink } from "@/components/downloads/MacDownloadLink";
import { WindowsDownloadLink } from "@/components/downloads/WindowsDownloadLink";

const buttonClass =
  "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90";

const secondaryButtonClass =
  "inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/40";

type ReleaseDownloadSectionProps = {
  release: NeudReleaseEntry;
  variant: "current" | "previous";
};

export function ReleaseDownloadSection({ release, variant }: ReleaseDownloadSectionProps) {
  const isPrevious = variant === "previous";

  return (
    <div className="space-y-4">
      {isPrevious ? (
        <p className="text-sm text-muted">
          Previous version — use only if you need to roll back to an older NEUD release.
        </p>
      ) : null}

      <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
        {release.highlights.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <div className="grid gap-4 sm:grid-cols-2">
        {release.platforms.windows.supported && release.platforms.windows.downloadUrl ? (
          <div className="rounded-md border border-border p-4 space-y-2">
            <p className="text-sm font-medium text-foreground">Windows</p>
            <p className="text-xs text-muted">
              Windows 10/11 · {release.platforms.windows.architecture}
            </p>
            {release.platforms.windows.artifactLabel ? (
              <p className="text-xs text-muted">{release.platforms.windows.artifactLabel}</p>
            ) : null}
            <WindowsDownloadLink
              href={release.platforms.windows.downloadUrl}
              className={isPrevious ? secondaryButtonClass : buttonClass}
            >
              Download for Windows
            </WindowsDownloadLink>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted">
            Windows installer not published for v{release.version}.
          </div>
        )}

        {release.platforms.macos.supported && release.platforms.macos.downloadUrl ? (
          <div className="rounded-md border border-border p-4 space-y-2">
            <p className="text-sm font-medium text-foreground">macOS</p>
            <p className="text-xs text-muted">
              Apple Silicon · {release.platforms.macos.architecture}
            </p>
            {release.platforms.macos.artifactLabel ? (
              <p className="text-xs text-muted">{release.platforms.macos.artifactLabel}</p>
            ) : null}
            <MacDownloadLink
              href={release.platforms.macos.downloadUrl}
              className={isPrevious ? secondaryButtonClass : buttonClass}
            >
              Download for macOS
            </MacDownloadLink>
            <p className="text-xs text-muted">
              {formatMacSigningLabel(release.macosSigningStatus)}
            </p>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted">
            No macOS Apple Silicon build was published for v{release.version}.
          </div>
        )}
      </div>

      {release.knownLimitations.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">Known limitations</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            {release.knownLimitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-xs text-muted">
        Released {formatReleaseDate(release.releaseDate)} ·{" "}
        <a
          href={release.githubReleaseUrl}
          className="font-medium text-primary hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub Release v{release.version}
        </a>
      </p>
    </div>
  );
}
