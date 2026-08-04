import {
  DEFAULT_AUTHENTICATED_LANDING_PATH,
  getDefaultProjectEnginePath,
  getPreferredAuthenticatedLandingPath,
} from "@/lib/routing/startup-paths";
import { shouldUseLocalData } from "@/lib/local/mode";

export const BROAD_ARROW_DEFAULT_PROJECT_SLUG = "broad-arrow-auctions";

export function getDefaultAuthenticatedPath(): string {
  return getPreferredAuthenticatedLandingPath(shouldUseLocalData());
}

export { getDefaultProjectEnginePath };
export { DEFAULT_AUTHENTICATED_LANDING_PATH };
