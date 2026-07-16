import Image from "next/image";
import { HMG_LOGO_PATH } from "@/lib/branding/logo";

type HmgHeroLogoProps = {
  hasLogo: boolean;
};

export function HmgHeroLogo({ hasLogo }: HmgHeroLogoProps) {
  if (hasLogo) {
    return (
      <Image
        src={HMG_LOGO_PATH}
        alt="HMG"
        width={420}
        height={420}
        className="h-auto w-full max-w-[220px] sm:max-w-[280px] md:max-w-[340px] lg:max-w-[420px]"
        style={{ width: "auto", height: "auto" }}
        priority
      />
    );
  }

  return (
    <span
      className="flex h-24 w-24 shrink-0 items-center justify-center rounded border border-border bg-surface-raised text-2xl font-semibold text-foreground sm:h-28 sm:w-28 sm:text-3xl"
      aria-hidden="true"
    >
      HMG
    </span>
  );
}
