import {
  DEFAULT_HOSTED_LANDING_PATH,
  normalizeApplicationPath,
} from "@/lib/routing/startup-paths";

export const DEFAULT_REDIRECT = DEFAULT_HOSTED_LANDING_PATH;

export function getSafeRedirectPath(
  path: string | null | undefined,
  fallback = DEFAULT_REDIRECT,
): string {
  return normalizeApplicationPath(path, fallback);
}
