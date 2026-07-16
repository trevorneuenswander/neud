"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type ProjectNavProps = {
  slug: string;
};

const navItems = [
  { href: "", label: "Overview" },
  { href: "/members", label: "Members" },
  { href: "/displays", label: "Displays" },
  { href: "/controllers", label: "Controllers" },
  { href: "/workers", label: "Workers" },
  { href: "/activity", label: "Activity" },
  { href: "/settings", label: "Settings" },
] as const;

export function ProjectNav({ slug }: ProjectNavProps) {
  const pathname = usePathname();
  const basePath = `/projects/${slug}`;

  return (
    <nav
      className="flex gap-1 overflow-x-auto border-b border-border pb-px"
      aria-label="Project"
    >
      {navItems.map((item) => {
        const href = item.href ? `${basePath}${item.href}` : basePath;
        const isActive =
          pathname === href ||
          (item.href !== "" && pathname.startsWith(`${href}/`));

        return (
          <Link
            key={item.label}
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
    </nav>
  );
}
