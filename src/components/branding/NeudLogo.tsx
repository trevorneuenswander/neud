import Image from "next/image";
import Link from "next/link";
import { APP_NAME, APP_TAGLINE } from "@/lib/branding/app-name";
import { NEUD_ICON_PATH } from "@/lib/branding/logo";

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

const iconPixels: Record<NeudLogoSize, number> = {
  sm: 22,
  md: 28,
  lg: 36,
  hero: 64,
};

export function NeudLogo({
  size = "md",
  showTagline = false,
  href = "/",
  className = "",
}: NeudLogoProps) {
  const iconSize = iconPixels[size];

  const content = (
    <div className={`inline-flex flex-col gap-1 ${className}`}>
      <span className="inline-flex items-center gap-2.5 sm:gap-3">
        <Image
          src={NEUD_ICON_PATH}
          alt=""
          width={iconSize}
          height={iconSize}
          className="shrink-0 rounded-md"
          style={{ width: iconSize, height: iconSize }}
          priority={size === "hero" || size === "lg"}
          unoptimized
        />
        <span
          className={`font-semibold uppercase text-foreground ${sizeClasses[size]}`}
        >
          {APP_NAME}
        </span>
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
        aria-label={APP_NAME}
      >
        {content}
      </Link>
    );
  }

  return content;
}
