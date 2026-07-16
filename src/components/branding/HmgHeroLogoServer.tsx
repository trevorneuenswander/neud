import { HmgHeroLogo } from "@/components/branding/HmgHeroLogo";
import { logoExists } from "@/lib/branding/logo-server";

export function HmgHeroLogoServer() {
  return <HmgHeroLogo hasLogo={logoExists()} />;
}
