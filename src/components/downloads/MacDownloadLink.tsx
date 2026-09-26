import type { ReactNode } from "react";
import { getMacDmgDownloadUrl } from "@/lib/downloads/mac-installer";

type MacDownloadLinkProps = {
  version?: string;
  href?: string;
  children: ReactNode;
  className?: string;
};

export function MacDownloadLink({ version, href, children, className }: MacDownloadLinkProps) {
  const resolvedHref =
    href ?? (version ? getMacDmgDownloadUrl(version) : "#");
  return (
    <a href={resolvedHref} className={className}>
      {children}
    </a>
  );
}

type MacDownloadButtonProps = {
  version?: string;
  href?: string;
  className?: string;
  label?: string;
};

export function MacDownloadButton({
  version,
  href,
  className = "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90",
  label = "Download for macOS",
}: MacDownloadButtonProps) {
  return (
    <MacDownloadLink version={version} href={href} className={className}>
      {label}
    </MacDownloadLink>
  );
}
