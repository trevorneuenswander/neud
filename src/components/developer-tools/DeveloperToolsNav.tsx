"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "scraper", label: "Webpage Scraper" },
  { href: "displays", label: "HTML Displays" },
  { href: "revisions", label: "Code Revisions" },
  { href: "validation-logs", label: "Validation Logs" },
] as const;

type DeveloperToolsNavProps = {
  slug: string;
};

export function DeveloperToolsNav({ slug }: DeveloperToolsNavProps) {
  const pathname = usePathname();
  const basePath = `/projects/${slug}/developer-tools`;

  return (
    <nav
      aria-label="Developer Tools"
      className="flex flex-wrap gap-2 border-b border-border pb-3"
    >
      {items.map((item) => {
        const href = `${basePath}/${item.href}`;
        const isActive = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={item.href}
            href={href}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              isActive
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
