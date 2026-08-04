import runtimeConfig from "../../../../shared/bag/bag-runtime-config.json";
import { BAG_LOGIN_CONFIG } from "../default-sources";

export type BagRuntimeConfig = typeof runtimeConfig;

export const BAG_RUNTIME_CONFIG: BagRuntimeConfig = runtimeConfig;

/** Selector groups passed to the worker bundle for BAG scraping. */
export function buildBagRuntimeConfigForWorker(): BagRuntimeConfig {
  return BAG_RUNTIME_CONFIG;
}

/** Validates manifest login selectors stay aligned with runtime config. */
export function assertBagLoginConfigAligned(): boolean {
  const join = (values: readonly string[]) => values.join(", ");
  return (
    join(BAG_RUNTIME_CONFIG.login.usernameSelectors) ===
      BAG_LOGIN_CONFIG.usernameSelectors &&
    join(BAG_RUNTIME_CONFIG.login.passwordSelectors) ===
      BAG_LOGIN_CONFIG.passwordSelectors &&
    join(BAG_RUNTIME_CONFIG.login.submitSelectors) ===
      BAG_LOGIN_CONFIG.submitSelectors &&
    BAG_RUNTIME_CONFIG.login.successSelector === BAG_LOGIN_CONFIG.successSelector &&
    BAG_RUNTIME_CONFIG.login.failureUrlSubstring ===
      BAG_LOGIN_CONFIG.failureUrlSubstring
  );
}
