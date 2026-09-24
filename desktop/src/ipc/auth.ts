import { z } from "zod";
import type { AppSettingsRepository } from "../repositories/app-settings-repository";
import type { AuthLicenseManager } from "../services/auth-license-manager";
import type { SupabaseUserSessionService } from "../services/supabase-user-session";
import {
  extractSupabaseProjectRef,
  type SupabasePublicConfig,
} from "../services/supabase-public-config";
import {
  CLOUD_SESSION_DIAGNOSTICS_KEY,
  createDefaultCloudSessionDiagnostics,
  type CloudSessionDiagnostics,
} from "../services/cloud-session-diagnostics";
import { registerIpcHandler } from "./channels";

const cloudSessionSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.number().int().positive(),
});

const verifiedSessionSchema = z
  .object({
    handoffTarget: z.enum(["desktop", "hosted"]).optional(),
    userId: z.string().uuid(),
    email: z.string().email(),
    displayName: z.string().nullable().optional(),
    team: z.string().nullable().optional(),
    role: z.string().min(1),
    entitlement: z.record(z.string(), z.unknown()).optional(),
    deviceId: z.string().uuid(),
    cloudSession: cloudSessionSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.handoffTarget === "desktop" && !value.cloudSession) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Desktop login requires a Supabase cloud session.",
        path: ["cloudSession"],
      });
    }
  });

export type StoreVerifiedSessionResult = {
  ok: true;
  sessionStoredInMain: boolean;
  cloudSessionStored: boolean;
  refreshTokenPersisted: boolean;
  accessTokenPersisted: boolean;
  mainProcessSessionAvailable: boolean;
};

function mergeDiagnostics(
  settings: AppSettingsRepository | undefined,
  patch: Partial<CloudSessionDiagnostics>,
): void {
  if (!settings) {
    return;
  }

  const current =
    settings.get<CloudSessionDiagnostics | null>(CLOUD_SESSION_DIAGNOSTICS_KEY, null) ??
    createDefaultCloudSessionDiagnostics();

  settings.set(CLOUD_SESSION_DIAGNOSTICS_KEY, {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

export function registerAuthIpc(
  auth: AuthLicenseManager,
  options?: {
    onSessionStored?: (input: { reason: "login"; startReason: string }) => void;
    onSessionCleared?: () => void;
    forceSignOut?: () => Promise<{ ok: boolean }>;
    userSession?: SupabaseUserSessionService;
    settings?: AppSettingsRepository;
    supabasePublicConfig?: SupabasePublicConfig | null;
  },
) {
  registerIpcHandler("neud:auth:getStatus", () => auth.getStatus());

  registerIpcHandler("neud:auth:getCloudSessionDiagnostics", () => {
    const persisted = options?.userSession?.getPersistedSessionProbe() ?? null;
    const stored =
      options?.settings?.get<CloudSessionDiagnostics | null>(
        CLOUD_SESSION_DIAGNOSTICS_KEY,
        null,
      ) ?? createDefaultCloudSessionDiagnostics();

    return {
      ...stored,
      persistedSessionFileExists: persisted?.persistedSessionFileExists ?? false,
      encryptedRefreshTokenPresent: persisted?.encryptedRefreshTokenPresent ?? false,
      encryptedAccessTokenPresent: persisted?.encryptedAccessTokenPresent ?? false,
      tokenExpiryAt: persisted?.tokenExpiryAt ?? null,
      sessionDecryptable: persisted?.sessionDecryptable ?? false,
      mainProcessSessionAvailable: persisted?.mainProcessSessionAvailable ?? false,
      safeStorageAvailable: persisted?.safeStorageAvailable ?? false,
      lastRestoreErrorCode: persisted?.lastRestoreErrorCode ?? null,
    };
  });

  registerIpcHandler("neud:auth:storeVerifiedSession", (_event, payload: unknown) => {
    const parsed = verifiedSessionSchema.parse(payload);
    const { cloudSession, handoffTarget, ...sessionPayload } = parsed;

    if (handoffTarget === "desktop" && !cloudSession) {
      throw new Error("Desktop login requires a Supabase cloud session.");
    }

    mergeDiagnostics(options?.settings, {
      rendererSignInSucceeded: true,
      sessionSentToMain: true,
      accessTokenReceived: Boolean(cloudSession?.accessToken),
      refreshTokenReceived: Boolean(cloudSession?.refreshToken),
    });

    const result = auth.storeVerifiedSession(sessionPayload);
    let storeResult = {
      inMemoryAvailable: false,
      refreshTokenPersisted: false,
      accessTokenPersisted: false,
    };

    if (cloudSession) {
      const issuerProjectRef = options?.supabasePublicConfig?.supabaseUrl
        ? extractSupabaseProjectRef(options.supabasePublicConfig.supabaseUrl)
        : null;
      storeResult = options?.userSession?.storeSession({
        userId: parsed.userId,
        accessToken: cloudSession.accessToken,
        refreshToken: cloudSession.refreshToken,
        expiresAt: cloudSession.expiresAt,
        issuerProjectRef,
      }) ?? storeResult;
    }

    const mainProcessSessionAvailable = options?.userSession?.hasCloudSession() ?? false;
    mergeDiagnostics(options?.settings, {
      sessionStoredInMain: mainProcessSessionAvailable,
      refreshTokenPersisted: storeResult.refreshTokenPersisted,
      accessTokenPersisted: storeResult.accessTokenPersisted,
      persistedSessionDecryptable: storeResult.refreshTokenPersisted,
      lastSessionStoreAt: new Date().toISOString(),
      lastSessionErrorCode: mainProcessSessionAvailable ? null : "cloud_session_not_stored",
    });

    if (handoffTarget === "desktop" && !mainProcessSessionAvailable) {
      throw new Error("Desktop cloud session could not be stored in the main process.");
    }

    options?.onSessionStored?.({ reason: "login", startReason: "login" });
    mergeDiagnostics(options?.settings, {
      sessionStoredNotificationFired: true,
      lastNotificationAt: new Date().toISOString(),
    });

    return {
      ok: true,
      sessionStoredInMain: true,
      cloudSessionStored: mainProcessSessionAvailable,
      refreshTokenPersisted: storeResult.refreshTokenPersisted,
      accessTokenPersisted: storeResult.accessTokenPersisted,
      mainProcessSessionAvailable,
    } satisfies StoreVerifiedSessionResult;
  });

  registerIpcHandler("neud:auth:clear", () => {
    auth.clear();
    options?.userSession?.clearSession();
    options?.onSessionCleared?.();
  });

  registerIpcHandler("neud:auth:forceSignOut", async () => {
    if (!options?.forceSignOut) {
      auth.clear();
      options?.userSession?.clearSession();
      options?.onSessionCleared?.();
      return { ok: true };
    }
    return options.forceSignOut();
  });
}
