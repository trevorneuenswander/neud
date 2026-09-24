import type { AuthStatus } from "@/lib/auth/user-directory-sync";

export type SharedAuthSnapshotFields = {
  authenticatedCloudSessionAvailable: boolean;
  authenticatedClientReady: boolean;
  hasCloudSession: boolean;
  hasRestorableCloudSession: boolean;
  reauthenticationRequired: boolean;
};

export type ProfileIndicatorState = "online" | "offline" | "sign_in";

export type DashboardConnectionState = "connected" | "offline" | "sign_in";

export function resolveProfileIndicatorState(input: {
  auth: Pick<AuthStatus, "mode" | "allowed">;
  sharedAuth: SharedAuthSnapshotFields | null;
}): ProfileIndicatorState {
  if (input.sharedAuth?.authenticatedCloudSessionAvailable) {
    return "online";
  }
  if (input.auth.allowed && (input.auth.mode === "offline" || input.auth.mode === "online")) {
    return "offline";
  }
  return "sign_in";
}

export function resolveDashboardConnectionState(input: {
  auth: Pick<AuthStatus, "mode" | "allowed">;
  sharedAuth: SharedAuthSnapshotFields | null;
}): DashboardConnectionState {
  if (input.sharedAuth?.reauthenticationRequired) {
    return "offline";
  }
  if (input.sharedAuth?.authenticatedCloudSessionAvailable) {
    return "connected";
  }
  return "offline";
}

export function profileIndicatorLabel(
  state: ProfileIndicatorState,
): "Online" | "Offline" | "Sign In" {
  switch (state) {
    case "online":
      return "Online";
    case "offline":
      return "Offline";
    case "sign_in":
      return "Sign In";
  }
}

export function dashboardConnectionLabel(state: DashboardConnectionState): string {
  switch (state) {
    case "connected":
      return "Connected";
    case "offline":
      return "Offline";
    case "sign_in":
      return "Sign In";
  }
}
