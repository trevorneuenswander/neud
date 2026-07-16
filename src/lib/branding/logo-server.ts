import "server-only";

import { existsSync } from "fs";
import path from "path";
import { HMG_LOGO_PATH } from "@/lib/branding/logo";

export { HMG_LOGO_PATH };

export function logoExists(): boolean {
  return existsSync(
    path.join(process.cwd(), "public", "branding", "hmg-logo.png"),
  );
}
