import { NEUD_PACKAGED } from "./neud-env.js";

/**
 * Load .env files for standalone worker development only.
 * Packaged desktop workers receive configuration from EngineManager spawn env.
 */
export async function loadDevDotenv() {
  if (NEUD_PACKAGED()) {
    return;
  }

  const { default: dotenv } = await import("dotenv");
  dotenv.config();
}
