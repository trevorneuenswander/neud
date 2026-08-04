import { randomUUID } from "crypto";
import type { AppSettingsRepository } from "../repositories/app-settings-repository";
import {
  DEFAULT_OWNER_EMAIL,
  isLegacyPlaceholderOwnerEmail,
} from "./default-owner-email";

export type LocalDesktopIdentity = {
  userId: string;
  email: string;
  displayName: string;
  isLocalDesktopUser: true;
};

export const LOCAL_DESKTOP_IDENTITY_SETTING_KEY = "neud.localIdentity";

export function abbreviateUserId(userId: string): string {
  return userId.length <= 8 ? userId : `${userId.slice(0, 8)}…`;
}

export function getOrCreateLocalDesktopIdentity(
  settings: AppSettingsRepository,
): { identity: LocalDesktopIdentity; created: boolean } {
  const existing = readStoredIdentity(settings);
  if (existing) {
    return { identity: existing, created: false };
  }

  const identity: LocalDesktopIdentity = {
    userId: randomUUID(),
    email: DEFAULT_OWNER_EMAIL,
    displayName: "Local NEUD Owner",
    isLocalDesktopUser: true,
  };

  settings.set(LOCAL_DESKTOP_IDENTITY_SETTING_KEY, identity);
  return { identity, created: true };
}

function readStoredIdentity(
  settings: AppSettingsRepository,
): LocalDesktopIdentity | null {
  const current = settings.get<Partial<LocalDesktopIdentity> | null>(
    LOCAL_DESKTOP_IDENTITY_SETTING_KEY,
    null,
  );
  if (isValidIdentity(current)) {
    if (isLegacyPlaceholderOwnerEmail(current.email)) {
      const migrated: LocalDesktopIdentity = {
        ...current,
        email: DEFAULT_OWNER_EMAIL,
      };
      settings.set(LOCAL_DESKTOP_IDENTITY_SETTING_KEY, migrated);
      return migrated;
    }

    return current;
  }

  return null;
}

function isValidIdentity(
  value: Partial<LocalDesktopIdentity> | null | undefined,
): value is LocalDesktopIdentity {
  return Boolean(
    value &&
      typeof value.userId === "string" &&
      value.userId.length > 0 &&
      typeof value.email === "string" &&
      value.email.length > 0 &&
      typeof value.displayName === "string" &&
      value.displayName.length > 0 &&
      value.isLocalDesktopUser === true,
  );
}
