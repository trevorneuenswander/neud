export function readNeudEnv(name) {
  return process.env[name]?.trim() || undefined;
}

export function readNeudEnvFlag(name) {
  return readNeudEnv(name) === "1";
}

export const NEUD_APP_DATA_DIR = () => readNeudEnv("NEUD_APP_DATA_DIR");

export const NEUD_LOCAL_API_URL = () => readNeudEnv("NEUD_LOCAL_API_URL");

export const NEUD_BROWSER_USER_DATA_DIR = () => readNeudEnv("NEUD_BROWSER_USER_DATA_DIR");

export const NEUD_COOKIES_DIR = () => readNeudEnv("NEUD_COOKIES_DIR");

export const NEUD_LEGACY_SERVER_ROOT = () => readNeudEnv("NEUD_LEGACY_SERVER_ROOT");

export const NEUD_LEGACY_DIAG_FILE = () => readNeudEnv("NEUD_LEGACY_DIAG_FILE");
