"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { MobileNavTrigger } from "@/components/portal/MobileNav";
import type { ProjectDataType } from "@/lib/projects/constants";
import { projectSupportsBagController } from "@/lib/projects/constants";
import { projectSupportsDataEngines } from "@/lib/data-engines/constants";
import type { ProjectRole } from "@/lib/projects/project-permissions";
import {
  PROJECT_NAV_DROPDOWN_WIDTH,
  PROJECT_NAV_DROPDOWN_WIDTH_CLASS,
} from "@/components/projects/project-nav-layout";

export type ProjectNavLayoutMode = "horizontal" | "dropdown";

type ProjectNavProps = {
  slug: string;
  projectType: ProjectDataType;
  canManageSettings: boolean;
  projectRole?: ProjectRole;
  layoutMode?: ProjectNavLayoutMode;
  navMeasureRef?: React.RefObject<HTMLDivElement | null>;
};

type ProjectNavItem = {
  href: string;
  label: string;
};

const baseNavItems = [
  { href: "", label: "Overview" },
  { href: "/data-engines", label: "Webpage Scraper", engineOnly: true },
  { href: "/controller", label: "Local Controller", bagOnly: true },
  { href: "/displays", label: "Displays" },
  { href: "/settings", label: "Settings", settingsOnly: true },
] as const;

function ProjectNavLinks({
  basePath,
  navItems,
  pathname,
  layout,
}: {
  basePath: string;
  navItems: ProjectNavItem[];
  pathname: string;
  layout: "horizontal" | "menu";
}) {
  return navItems.map((item) => {
    const href = item.href ? `${basePath}${item.href}` : basePath;
    const isActive =
      pathname === href || (item.href !== "" && pathname.startsWith(`${href}/`));

    if (layout === "menu") {
      return (
        <Link
          key={item.href || "overview"}
          href={href}
          role="menuitem"
          aria-current={isActive ? "page" : undefined}
          className={`block w-full cursor-pointer px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
            isActive
              ? "bg-primary/15 font-medium text-foreground"
              : "text-foreground hover:bg-surface-raised"
          }`}
        >
          {item.label}
        </Link>
      );
    }

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
  });
}

function ProjectNavDropdown({
  basePath,
  navItems,
  pathname,
}: {
  basePath: string;
  navItems: ProjectNavItem[];
  pathname: string;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);

  const activeItem = useMemo(() => {
    return (
      navItems.find((item) => {
        const href = item.href ? `${basePath}${item.href}` : basePath;
        return (
          pathname === href || (item.href !== "" && pathname.startsWith(`${href}/`))
        );
      }) ?? navItems[0]
    );
  }, [basePath, navItems, pathname]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const menu = containerRef.current?.querySelector('[role="menu"]');
    const firstItem = menu?.querySelector('[role="menuitem"]') as
      | HTMLAnchorElement
      | undefined;
    firstItem?.focus();
  }, [open]);

  return (
    <div
      ref={containerRef}
      className={`relative shrink-0 ${PROJECT_NAV_DROPDOWN_WIDTH_CLASS}`}
      style={{ width: PROJECT_NAV_DROPDOWN_WIDTH }}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        className={`inline-flex ${PROJECT_NAV_DROPDOWN_WIDTH_CLASS} items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
        style={{ width: PROJECT_NAV_DROPDOWN_WIDTH }}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="truncate">{activeItem?.label ?? "Project"}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Project sections"
          className={`absolute left-0 z-50 mt-1 overflow-hidden rounded-md border border-border bg-surface py-1 shadow-lg ${PROJECT_NAV_DROPDOWN_WIDTH_CLASS}`}
          style={{ width: PROJECT_NAV_DROPDOWN_WIDTH }}
          onClick={() => setOpen(false)}
        >
          <ProjectNavLinks
            basePath={basePath}
            navItems={navItems}
            pathname={pathname}
            layout="menu"
          />
        </div>
      ) : null}
    </div>
  );
}

export function ProjectNav({
  slug,
  projectType,
  canManageSettings,
  projectRole = "admin",
  layoutMode = "horizontal",
  navMeasureRef,
}: ProjectNavProps) {
  const pathname = usePathname();
  const basePath = `/projects/${slug}`;
  const supportsEngines = projectSupportsDataEngines(projectType);
  const supportsBagController = projectSupportsBagController(projectType);
  const isViewer = projectRole === "viewer";

  const engineNavLabel = "Webpage Scraper";

  const navItems: ProjectNavItem[] = baseNavItems
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
        ? { href: item.href, label: engineNavLabel }
        : { href: item.href, label: item.label },
    );

  const showDropdown = layoutMode === "dropdown";

  return (
    <nav
      className="relative flex min-w-0 flex-1 items-center gap-1"
      aria-label="Project"
    >
      <MobileNavTrigger />
      <div
        ref={navMeasureRef}
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 -z-10 flex w-max max-w-none gap-1 opacity-0"
      >
        <ProjectNavLinks
          basePath={basePath}
          navItems={navItems}
          pathname={pathname}
          layout="horizontal"
        />
      </div>
      {showDropdown ? null : (
        <div className="flex min-w-0 flex-1 gap-1 overflow-hidden">
          <ProjectNavLinks
            basePath={basePath}
            navItems={navItems}
            pathname={pathname}
            layout="horizontal"
          />
        </div>
      )}
      {showDropdown ? (
        <ProjectNavDropdown
          basePath={basePath}
          navItems={navItems}
          pathname={pathname}
        />
      ) : null}
    </nav>
  );
}
