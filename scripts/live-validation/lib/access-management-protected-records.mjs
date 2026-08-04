export const PROTECTED_TEAM_NAMES = new Set([
  "neud",
  "hildreth media group",
]);

export const PROTECTED_PROJECT_SLUGS = new Set([
  "broad-arrow-auctions",
  "broad-arrow-auction",
]);

export const PROTECTED_USER_NAME_PATTERN = /^trevor\s+neuenswander$/i;

export const TEST_EMAIL_DOMAIN = "@example.com";

export const TEST_EMAIL_PREFIXES = [
  "access-owner-",
  "access-outsider-",
  "live-owner-",
  "live-admin-",
  "live-manager-a-",
  "live-manager-b-",
  "live-operator-a-",
  "live-viewer-a-",
  "live-outsider-",
  "directory-diagnose-",
  "invitee-",
];

export function normalizeName(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function isProtectedTeam(record) {
  return PROTECTED_TEAM_NAMES.has(normalizeName(record.name));
}

export function isProtectedProject(record) {
  const slug = String(record.slug ?? "").toLowerCase();
  if (PROTECTED_PROJECT_SLUGS.has(slug) || slug.startsWith("broad-arrow")) {
    return true;
  }
  return /broad arrow/i.test(String(record.name ?? ""));
}

export function isProtectedUser(record) {
  const fullName = String(record.full_name ?? record.fullName ?? "").trim();
  if (PROTECTED_USER_NAME_PATTERN.test(fullName)) {
    return true;
  }
  const email = String(record.email ?? "").toLowerCase();
  return email.length > 0 && !email.endsWith(TEST_EMAIL_DOMAIN);
}

export function maskEmail(email) {
  const normalized = String(email ?? "").trim().toLowerCase();
  if (!normalized.includes("@")) {
    return null;
  }
  const [local, domain] = normalized.split("@");
  const maskedLocal =
    local.length <= 2 ? `${local[0] ?? "*"}*` : `${local.slice(0, 2)}***`;
  return `${maskedLocal}@${domain}`;
}
