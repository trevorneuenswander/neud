export const DEFAULT_OWNER_EMAIL = "trevorneuenswander@gmail.com";

export const HILDRETH_ADMIN_EMAIL = "trevor@hildrethmedia.com";

/** Disposable bootstrap identities that may be deactivated during owner migration. */
export const LEGACY_PLACEHOLDER_OWNER_EMAILS = [
  "local@neud.desktop",
  "owner@neud.local",
] as const;

/** Emails that historically served as the default owner before canonical owner migration. */
export const LEGACY_DEFAULT_OWNER_EMAILS = [
  HILDRETH_ADMIN_EMAIL,
  ...LEGACY_PLACEHOLDER_OWNER_EMAILS,
] as const;

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

export function isHildrethAdminEmail(email: string): boolean {
  return normalize(email) === normalize(HILDRETH_ADMIN_EMAIL);
}

export function isLegacyPlaceholderOwnerEmail(email: string): boolean {
  const normalized = normalize(email);
  return LEGACY_PLACEHOLDER_OWNER_EMAILS.some((legacy) => legacy === normalized);
}

export function isLegacyDefaultOwnerEmail(email: string): boolean {
  const normalized = normalize(email);
  return LEGACY_DEFAULT_OWNER_EMAILS.some((legacy) => legacy === normalized);
}

export function shouldClearStaleOwnerAuthCache(email: string, role: string): boolean {
  const normalizedEmail = normalize(email);
  const normalizedRole = role.trim().toLowerCase();
  if (normalizedRole !== "owner") {
    return false;
  }
  return (
    isLegacyPlaceholderOwnerEmail(normalizedEmail) || isHildrethAdminEmail(normalizedEmail)
  );
}
