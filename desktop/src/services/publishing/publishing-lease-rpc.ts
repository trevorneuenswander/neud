import type { PublishingRpcResult } from "./cloud-publishing-client";

export type LeaseRpcKind = "acquire" | "renew";

export type ValidatedLeaseRpcResult = {
  attempted: true;
  rpcName: string;
  succeeded: boolean;
  errorCode: string | null;
  safeMessage: string | null;
  responsePresent: boolean;
  responseValid: boolean;
  leasePresent: boolean;
  leasePublisherInstanceId: string | null;
  leaseExpiresAt: string | null;
  projectPublishingEnabled: boolean | null;
  raw: PublishingRpcResult | null;
};

export function leaseRpcName(kind: LeaseRpcKind): string {
  return kind === "acquire"
    ? "acquire_project_publisher_lease"
    : "renew_project_publisher_lease";
}

export function validateLeaseRpcResponse(
  kind: LeaseRpcKind,
  data: unknown,
): ValidatedLeaseRpcResult {
  const rpcName = leaseRpcName(kind);
  const base: ValidatedLeaseRpcResult = {
    attempted: true,
    rpcName,
    succeeded: false,
    errorCode: null,
    safeMessage: null,
    responsePresent: data != null,
    responseValid: false,
    leasePresent: false,
    leasePublisherInstanceId: null,
    leaseExpiresAt: null,
    projectPublishingEnabled: null,
    raw: null,
  };

  if (!data || typeof data !== "object") {
    return {
      ...base,
      errorCode: "response_invalid",
      safeMessage: "Publisher lease RPC returned no payload.",
    };
  }

  const result = data as PublishingRpcResult;
  base.raw = result;

  if (typeof result.ok !== "boolean") {
    return {
      ...base,
      errorCode: "response_invalid",
      safeMessage: "Publisher lease RPC payload missing ok flag.",
    };
  }

  base.responseValid = true;

  if (!result.ok) {
    return {
      ...base,
      errorCode: typeof result.code === "string" ? result.code : "lease_rpc_failed",
      safeMessage:
        typeof result.message === "string" && result.message.trim().length > 0
          ? result.message
          : "Publisher lease RPC reported failure.",
    };
  }

  const expiresAt =
    typeof result.lease_expires_at === "string" ? result.lease_expires_at : null;
  const expiresMs = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  if (!expiresAt || !Number.isFinite(expiresMs) || expiresMs <= Date.now()) {
    return {
      ...base,
      errorCode: "response_invalid",
      safeMessage: "Publisher lease RPC succeeded but lease_expires_at is missing or expired.",
      leaseExpiresAt: expiresAt,
    };
  }

  const publisherInstanceId =
    typeof result.owner_instance_id === "string"
      ? result.owner_instance_id
      : typeof result.publisher_instance_id === "string"
        ? result.publisher_instance_id
        : null;

  return {
    ...base,
    succeeded: true,
    errorCode: null,
    safeMessage: null,
    leasePresent: true,
    leasePublisherInstanceId: publisherInstanceId,
    leaseExpiresAt: expiresAt,
    projectPublishingEnabled:
      typeof result.online_publishing_enabled === "boolean"
        ? result.online_publishing_enabled
        : null,
  };
}
