import { HmgLogo } from "@/components/branding/HmgLogo";
import { logoExists } from "@/lib/branding/logo-server";

type HmgLogoServerProps = Omit<
  React.ComponentProps<typeof HmgLogo>,
  "hasLogo"
>;

export function HmgLogoServer(props: HmgLogoServerProps) {
  return <HmgLogo {...props} hasLogo={logoExists()} />;
}
