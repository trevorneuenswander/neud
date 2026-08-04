import runtimeConfig from "../../../shared/bag/bag-runtime-config.json" with { type: "json" };

export const BAG_RUNTIME_CONFIG = runtimeConfig;

export function resolveBagRuntimeConfig(bundle) {
  if (bundle?.bagRuntime && typeof bundle.bagRuntime === "object") {
    return bundle.bagRuntime;
  }
  return BAG_RUNTIME_CONFIG;
}

export function joinSelectors(selectors) {
  if (typeof selectors === "string") return selectors;
  if (Array.isArray(selectors)) return selectors.join(", ");
  return "";
}
