import type { SharedCloudAuthSnapshot } from "./shared-cloud-auth-snapshot";

export type ProfileIndicatorState = "online" | "offline" | "sign_in";

export type DashboardConnectionState = "connected" | "offline" | "sign_in";

export function resolveProfileIndicatorState(input: {
  localSessionValid: boolean;
  authMode: "locked" | "offline" | "online";
  sharedAuth: SharedCloudAuthSnapshot | null;
}): ProfileIndicatorState {
  if (input.sharedAuth?.authenticatedCloudSessionAvailable) {
    return "online";
  }
  if (input.localSessionValid && (input.authMode === "offline" || input.authMode === "online")) {
    return "offline";
  }
  return "sign_in";
}

export function resolveDashboardConnectionState(input: {
  localSessionValid: boolean;
  authMode: "locked" | "offline" | "online";
  sharedAuth: SharedCloudAuthSnapshot | null;
}): DashboardConnectionState {
  if (input.sharedAuth?.reauthenticationRequired) {
    return "offline";
  }
  if (input.sharedAuth?.authenticatedCloudSessionAvailable) {
    return "connected";
  }
  return "offline";
}
