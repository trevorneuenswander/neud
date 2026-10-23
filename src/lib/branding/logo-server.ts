import fs from "node:fs";
import path from "node:path";
import { NEUD_LOGO_PATH } from "@/lib/branding/logo";

export { NEUD_LOGO_PATH };

/** Reads the canonical public brand mark as base64 for server-side embeds. */
export function readNeudLogoBase64(): string | null {
  const logoPath = path.join(process.cwd(), "public", "branding", "neud-icon.png");
  if (!fs.existsSync(logoPath)) {
    return null;
  }

  const buffer = fs.readFileSync(logoPath);
  return buffer.toString("base64");
}
