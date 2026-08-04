import type { FirstCloudAccessFailureStage } from "./authenticated-client-provider";
import {
  createEmptyDirectoryRpcDiagnostics,
  type DirectoryRpcDiagnostics,
} from "./cloud-access-directory-rpc";

export type CloudAccessBridgeDiagnostics = {
  sessionServiceInstanceIdHash: string | null;
  cloudAccessBridgeInstanceInitialized: boolean;
  bridgeUsesSharedSessionService: boolean;
  persistedTokensPresent: boolean;
  authenticatedClientCreationAttempted: boolean;
  authenticatedClientCreationResult: "success" | "failure" | "not_attempted";
  authenticatedClientCreationErrorCode: string | null;
  sessionRefreshAttempted: boolean;
  sessionRefreshResult: "success" | "failure" | "not_attempted" | "still_fresh";
  directoryRpcAttempted: boolean;
  firstCloudAccessFailureStage: FirstCloudAccessFailureStage;
} & DirectoryRpcDiagnostics;

export function createEmptyCloudAccessBridgeDiagnostics(): CloudAccessBridgeDiagnostics {
  return {
    sessionServiceInstanceIdHash: null,
    cloudAccessBridgeInstanceInitialized: false,
    bridgeUsesSharedSessionService: false,
    persistedTokensPresent: false,
    authenticatedClientCreationAttempted: false,
    authenticatedClientCreationResult: "not_attempted",
    authenticatedClientCreationErrorCode: null,
    sessionRefreshAttempted: false,
    sessionRefreshResult: "not_attempted",
    directoryRpcAttempted: false,
    firstCloudAccessFailureStage: "none",
    ...createEmptyDirectoryRpcDiagnostics(),
  };
}
