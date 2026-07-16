import { HmgHeroLogo } from "@/components/branding/HmgHeroLogo";
import { logoExists } from "@/lib/branding/logo-server";

type HmgHeroLogoServerProps = {
  size?: "hero" | "featured";
};

export function HmgHeroLogoServer({ size = "hero" }: HmgHeroLogoServerProps) {
  return <HmgHeroLogo hasLogo={logoExists()} size={size} />;
}
