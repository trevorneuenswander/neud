"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MobileNavTrigger } from "@/components/portal/MobileNav";
import type { ProjectDataType } from "@/lib/projects/constants";
import { projectSupportsBagController } from "@/lib/projects/constants";
import { projectSupportsDataEngines } from "@/lib/data-engines/constants";
import type { ProjectRole } from "@/lib/projects/project-permissions";

type ProjectNavProps = {
  slug: string;
  projectType: ProjectDataType;
  canManageSettings: boolean;
  projectRole?: ProjectRole;
};

const baseNavItems = [
  { href: "", label: "Overview" },
  { href: "/data-engines", label: "Webpage Scraper", engineOnly: true },
  { href: "/controller", label: "Local Controller", bagOnly: true },
  { href: "/displays", label: "Displays" },
  { href: "/settings", label: "Settings", settingsOnly: true },
] as const;

export function ProjectNav({
  slug,
  projectType,
  canManageSettings,
  projectRole = "admin",
}: ProjectNavProps) {
  const pathname = usePathname();
  const basePath = `/projects/${slug}`;
  const supportsEngines = projectSupportsDataEngines(projectType);
  const supportsBagController = projectSupportsBagController(projectType);
  const isViewer = projectRole === "viewer";

  const engineNavLabel = "Webpage Scraper";

  const navItems = baseNavItems
    .filter((item) => {
      if (isViewer) {
        return item.href === "/displays";
      }
      if ("settingsOnly" in item && item.settingsOnly) {
        return canManageSettings;
      }
      if ("engineOnly" in item && item.engineOnly) {
        return supportsEngines;
      }
      if ("bagOnly" in item && item.bagOnly) {
        return supportsBagController;
      }
      if (item.href === "" && isViewer) {
        return false;
      }
      return true;
    })
    .map((item) =>
      item.href === "/data-engines"
        ? { ...item, label: engineNavLabel }
        : item,
    );

  return (
    <nav
      className="flex min-w-0 flex-1 items-center gap-1"
      aria-label="Project"
    >
      <MobileNavTrigger />
      <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
        {navItems.map((item) => {
          const href = item.href ? `${basePath}${item.href}` : basePath;
          const isActive =
            pathname === href ||
            (item.href !== "" && pathname.startsWith(`${href}/`));

          return (
            <Link
              key={item.href || "overview"}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={`shrink-0 cursor-pointer border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted hover:border-border hover:text-foreground"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
