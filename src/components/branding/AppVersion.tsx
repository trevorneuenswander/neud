"use client";

import { useAppVersion } from "@/lib/version/use-app-version";

type AppVersionProps = {
  placement?: "sidebar" | "hero";
  className?: string;
};

const placementClasses = {
  sidebar: "sidebar-version shrink-0 whitespace-nowrap text-[10px] font-medium tracking-wide text-muted",
  hero: "text-xs font-medium tracking-wide text-muted",
} as const;

export function AppVersion({
  placement = "sidebar",
  className = "",
}: AppVersionProps) {
  const label = useAppVersion();

  if (!label) {
    return null;
  }

  return (
    <span
      className={`${placementClasses[placement]} ${className}`.trim()}
      aria-label={`Release version ${label}`}
    >
      {label}
    </span>
  );
}
