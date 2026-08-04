import {
  TEST_EMAIL_DOMAIN,
  TEST_EMAIL_PREFIXES,
  isProtectedProject,
  isProtectedTeam,
  isProtectedUser,
  maskEmail,
  normalizeName,
} from "./access-management-protected-records.mjs";

export function isExampleTestEmail(email) {
  const normalized = String(email ?? "").toLowerCase();
  if (!normalized.endsWith(TEST_EMAIL_DOMAIN)) {
    return false;
  }
  return TEST_EMAIL_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function isMatrixTeamName(name) {
  return /^matrix team \d+$/i.test(String(name ?? "").trim());
}

const VALIDATION_PROJECT_NAME_EXACT = new Set([
  "Live Project A",
  "Live Project B",
  "Rate 0",
  "Rate 1",
  "Rate 2",
  "Rate Blocked",
  "Anon Test",
  "Slug Conflict",
]);

export function isValidationProjectSlug(slug) {
  const normalized = String(slug ?? "").toLowerCase();
  return (
    normalized.startsWith("neud-validation-") ||
    normalized.startsWith("live-a-") ||
    normalized.startsWith("live-b-") ||
    normalized.startsWith("rate-") ||
    normalized.startsWith("anon-")
  );
}

export function isValidationProjectRecord(record) {
  if (isProtectedProject(record)) {
    return false;
  }

  const slug = String(record.slug ?? "").toLowerCase();
  const name = String(record.name ?? "").trim();

  if (isValidationProjectSlug(slug)) {
    return true;
  }

  if (name.startsWith("[NEUD Validation]")) {
    return true;
  }

  return VALIDATION_PROJECT_NAME_EXACT.has(name);
}

export function classifyTeam(record) {
  if (isProtectedTeam(record)) {
    return "intended_real";
  }
  if (isMatrixTeamName(record.name)) {
    return "automated_test_fixture";
  }
  if (record.deleted_at) {
    return "legacy_deleted_project";
  }
  if (record.is_active === false) {
    return "legacy_deleted_project";
  }
  return "unknown";
}

export function classifyUser(record, context = {}) {
  if (isProtectedUser(record)) {
    return "intended_real";
  }
  if (isExampleTestEmail(record.email)) {
    return "automated_test_fixture";
  }
  const hasTeamMembership = (context.teamMembershipCount ?? 0) > 0;
  const hasProjectMembership = (context.projectMembershipCount ?? 0) > 0;
  if (!hasTeamMembership && !hasProjectMembership && record.role === "user") {
    return "orphaned_membership";
  }
  return "unknown";
}

export function classifyProject(record) {
  if (isProtectedProject(record)) {
    return "intended_real";
  }
  if (isValidationProjectRecord(record)) {
    return "automated_test_fixture";
  }
  if (record.archived_at || record.is_active === false) {
    return "legacy_deleted_project";
  }
  return "unknown";
}

export function classifyInvitation(record) {
  const email = String(record.email_normalized ?? record.email ?? "");
  if (isExampleTestEmail(email)) {
    return "automated_test_fixture";
  }
  switch (record.status) {
    case "pending":
      return "pending_real";
    case "expired":
      return "expired_invitation";
    case "revoked":
      return "revoked_invitation";
    case "accepted":
      return "pending_real";
    default:
      return "unknown";
  }
}

export function summarizeInventoryCounts(records, field = "classification") {
  return records.reduce((counts, record) => {
    const key = record[field] ?? "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

export function sanitizeUserRecord(record, context) {
  return {
    id: record.id,
    displayName: record.full_name ?? null,
    emailDomain: maskEmail(record.email)?.split("@")[1] ?? null,
    maskedEmail: maskEmail(record.email),
    platformRole: record.role ?? null,
    teamMembershipCount: context.teamMembershipCount ?? 0,
    projectMembershipCount: context.projectMembershipCount ?? 0,
    createdAt: record.created_at ?? null,
    classification: classifyUser(record, context),
  };
}

export function sanitizeTeamRecord(record, context = {}) {
  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    createdAt: record.created_at ?? null,
    createdBy: record.created_by ?? null,
    isActive: record.is_active ?? null,
    memberCount: context.memberCount ?? 0,
    projectCount: context.projectCount ?? 0,
    classification: classifyTeam(record),
  };
}

export function sanitizeProjectRecord(record, context = {}) {
  return {
    id: record.id,
    slug: record.slug,
    name: record.name,
    isActive: record.is_active ?? null,
    archivedAt: record.archived_at ?? null,
    projectMemberCount: context.projectMemberCount ?? 0,
    displayCount: context.displayCount ?? 0,
    createdAt: record.created_at ?? null,
    classification: classifyProject(record),
  };
}

export function sanitizeInvitationRecord(record, context = {}) {
  return {
    id: record.id,
    maskedEmail: maskEmail(record.email_normalized ?? record.email),
    status: record.status ?? null,
    createdAt: record.created_at ?? null,
    expiresAt: record.expires_at ?? null,
    teamAssignmentCount: record.team_id ? 1 : 0,
    projectAssignmentCount: context.projectAssignmentCount ?? 0,
    classification: classifyInvitation(record),
  };
}
