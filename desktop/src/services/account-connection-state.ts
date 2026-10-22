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

/**
 * Cloud connection as shown to the user. Never collapses these into a single "Offline":
 * - network_offline: the machine cannot reach the internet.
 * - reconnecting: network is up, a cloud session exists (or is restorable), and the
 *   keeper is still refreshing the token / rebuilding the authenticated client.
 * - authentication_required: the cloud refresh token is rejected or no cloud session exists.
 */
export type CloudConnectionState =
  | "connected"
  | "network_offline"
  | "reconnecting"
  | "authentication_required";

export function resolveCloudConnectionState(input: {
  networkReachable: boolean;
  sharedAuth: SharedCloudAuthSnapshot | null;
}): CloudConnectionState {
  const shared = input.sharedAuth;
  if (shared?.reauthenticationRequired) {
    return "authentication_required";
  }
  if (!input.networkReachable) {
    return "network_offline";
  }
  if (shared?.authenticatedCloudSessionAvailable && !shared.tokenExpired) {
    return "connected";
  }
  if (!shared || (!shared.hasCloudSession && !shared.hasRestorableCloudSession)) {
    return "authentication_required";
  }
  return "reconnecting";
}
