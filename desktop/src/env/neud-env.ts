export function readNeudEnv(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

export function readNeudEnvFlag(name: string): boolean {
  return readNeudEnv(name) === "1";
}

export const NEUD_DESKTOP_DEV = () => readNeudEnvFlag("NEUD_DESKTOP_DEV");

export const NEUD_APP_DATA_DIR = () => readNeudEnv("NEUD_APP_DATA_DIR");

export const NEUD_LOCAL_API_URL = () => readNeudEnv("NEUD_LOCAL_API_URL");

export const NEUD_BROWSER_USER_DATA_DIR = () => readNeudEnv("NEUD_BROWSER_USER_DATA_DIR");

export const NEUD_COOKIES_DIR = () => readNeudEnv("NEUD_COOKIES_DIR");

export const NEUD_CURRENCY_API_KEY = () => readNeudEnv("NEUD_CURRENCY_API_KEY");

export const NEUD_EMAIL_PROVIDER = () => readNeudEnv("NEUD_EMAIL_PROVIDER");

export const NEUD_AUTH_SIGNING_SECRET = () => readNeudEnv("NEUD_AUTH_SIGNING_SECRET");

export const NEUD_ALLOW_PLAINTEXT_CREDENTIALS = () =>
  readNeudEnvFlag("NEUD_ALLOW_PLAINTEXT_CREDENTIALS");

/** Development-only: auto-establish the synthetic local desktop owner session. Never used in packaged builds. */
export const NEUD_ALLOW_LOCAL_DESKTOP_AUTH = () =>
  readNeudEnvFlag("NEUD_ALLOW_LOCAL_DESKTOP_AUTH");

export const NEUD_DEV_SERVER_URL = () =>
  readNeudEnv("NEUD_DEV_SERVER_URL") ?? "http://127.0.0.1:3000";

export const NEUD_TRUSTED_PORTAL_ORIGIN = () => readNeudEnv("NEUD_TRUSTED_PORTAL_ORIGIN");

export const NEUD_LEGACY_DIAG_FILE = () => readNeudEnv("NEUD_LEGACY_DIAG_FILE");
