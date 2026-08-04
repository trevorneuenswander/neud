import { isDesktopEnvironment } from "@/lib/desktop/client";

/** Desktop Electron sidebar only — never run on hosted Vercel/browser routes. */
export function shouldRunDesktopConnectivityProbe(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return isDesktopEnvironment();
}
