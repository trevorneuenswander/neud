import type { ReactNode } from "react";
import {
  getGitHubReleasePageUrl,
  getWindowsInstallerDownloadUrl,
} from "@/lib/downloads/windows-installer";

type WindowsDownloadLinkProps = {
  children: ReactNode;
  className?: string;
  href?: string;
};

/**
 * Direct GitHub Releases download link for the Windows installer.
 * Uses a stable asset filename (NEUD-Setup-latest-x64.exe) by default.
 */
export function WindowsDownloadLink({ children, className, href }: WindowsDownloadLinkProps) {
  return (
    <a href={href ?? getWindowsInstallerDownloadUrl()} className={className}>
      {children}
    </a>
  );
}

type WindowsDownloadButtonProps = {
  className?: string;
  label?: string;
};

export function WindowsDownloadButton({
  className = "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90",
  label = "Download for Windows",
}: WindowsDownloadButtonProps) {
  return (
    <WindowsDownloadLink className={className}>{label}</WindowsDownloadLink>
  );
}

export function WindowsDownloadReleaseNotesLink({
  className = "text-sm font-medium text-primary hover:underline",
  children = "View release notes on GitHub",
  href,
}: {
  className?: string;
  children?: ReactNode;
  href?: string;
}) {
  return (
    <a
      href={href ?? getGitHubReleasePageUrl()}
      className={className}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  );
}
