import Image from "next/image";
import { HMG_LOGO_PATH } from "@/lib/branding/logo";

type HmgHeroLogoProps = {
  hasLogo: boolean;
  size?: "hero" | "featured";
};

const imageSizeClasses = {
  hero: "max-w-[220px] sm:max-w-[280px] md:max-w-[340px] lg:max-w-[420px]",
  featured: "max-w-[160px] sm:max-w-[200px] md:max-w-[240px]",
};

const fallbackSizeClasses = {
  hero: "h-24 w-24 text-2xl sm:h-28 sm:w-28 sm:text-3xl",
  featured: "h-20 w-20 text-xl sm:h-24 sm:w-24 sm:text-2xl",
};

export function HmgHeroLogo({ hasLogo, size = "hero" }: HmgHeroLogoProps) {
  if (hasLogo) {
    return (
      <Image
        src={HMG_LOGO_PATH}
        alt="HMG"
        width={420}
        height={420}
        className={`h-auto w-full ${imageSizeClasses[size]}`}
        style={{ width: "auto", height: "auto" }}
        priority
      />
    );
  }

  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded border border-border bg-surface-raised font-semibold text-foreground ${fallbackSizeClasses[size]}`}
      aria-hidden="true"
    >
      HMG
    </span>
  );
}
