import fs from "fs";
import path from "path";
import { NEUD_LOGO_PATH } from "@/lib/branding/logo";

export { NEUD_LOGO_PATH };

export function readNeudLogoBase64(): string | null {
  const logoPath = path.join(process.cwd(), "public", "branding", "neud-logo.png");
  if (!fs.existsSync(logoPath)) {
    return null;
  }

  const buffer = fs.readFileSync(logoPath);
  return `data:image/png;base64,${buffer.toString("base64")}`;
}
