import Link from "next/link";
import { APP_NAME, APP_TAGLINE } from "@/lib/branding/app-name";

type NeudLogoSize = "sm" | "md" | "lg" | "hero";

type NeudLogoProps = {
  size?: NeudLogoSize;
  showTagline?: boolean;
  href?: string | null;
  className?: string;
};

const sizeClasses: Record<NeudLogoSize, string> = {
  sm: "text-sm tracking-[0.28em]",
  md: "text-base tracking-[0.32em] sm:text-lg",
  lg: "text-xl tracking-[0.34em] sm:text-2xl",
  hero: "text-3xl tracking-[0.36em] sm:text-4xl md:text-5xl",
};

const taglineClasses: Record<NeudLogoSize, string> = {
  sm: "text-[10px] tracking-wide",
  md: "text-xs tracking-wide sm:text-sm",
  lg: "text-sm tracking-wide",
  hero: "text-sm tracking-wide sm:text-base",
};

export function NeudLogo({
  size = "md",
  showTagline = false,
  href = "/",
  className = "",
}: NeudLogoProps) {
  const content = (
    <div className={`inline-flex flex-col gap-1 ${className}`}>
      <span
        className={`font-semibold uppercase text-foreground ${sizeClasses[size]}`}
      >
        {APP_NAME}
      </span>
      {showTagline ? (
        <span className={`text-muted ${taglineClasses[size]}`}>{APP_TAGLINE}</span>
      ) : null}
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="inline-flex rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {content}
      </Link>
    );
  }

  return content;
}
