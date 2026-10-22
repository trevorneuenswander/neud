/**
 * Resolve a human-readable subject label for access activity sentences.
 * Prefer full name, then email, then a stable identifier (never invent names).
 */
export function resolveActivitySubjectLabel(input: {
  fullName?: string | null;
  email?: string | null;
  userId?: string | null;
}): string {
  const fullName = typeof input.fullName === "string" ? input.fullName.trim() : "";
  if (fullName) {
    return fullName;
  }
  const email = typeof input.email === "string" ? input.email.trim() : "";
  if (email) {
    return email;
  }
  const userId = typeof input.userId === "string" ? input.userId.trim() : "";
  return userId || "unknown user";
}

/** Assigned {Name} to project */
export function formatProjectAccessAssignedDescription(subjectLabel: string): string {
  const label = subjectLabel.trim() || "unknown user";
  return `Assigned ${label} to project`;
}

/** Removed {Name} from project */
export function formatProjectAccessRemovedDescription(subjectLabel: string): string {
  const label = subjectLabel.trim() || "unknown user";
  return `Removed ${label} from project`;
}

/** Assigned {Team} to project */
export function formatProjectTeamAssignedDescription(teamName: string): string {
  const name = teamName.trim() || "Team";
  return `Assigned ${name} to project`;
}

/** Removed {Team} from project */
export function formatProjectTeamRemovedDescription(teamName: string): string {
  const name = teamName.trim() || "Team";
  return `Removed ${name} from project`;
}

function readMetaString(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

const GENERIC_MEMBER_REMOVED = new Set([
  "project access removed.",
  "project access removed",
  "removed project member.",
  "removed project member",
  "project member removed",
  "project member removed.",
  "removed user from a project",
  "removed user from a project.",
  "removed user from project",
  "removed user from project.",
]);

const GENERIC_MEMBER_ASSIGNED = new Set([
  "project access granted.",
  "project access granted",
  "updated project member.",
  "updated project member",
  "assigned user to project",
  "assigned user to project.",
  "project member added",
  "project member added.",
]);

const GENERIC_TEAM_ASSIGNED = new Set([
  "assigned team to project.",
  "assigned team to project",
  "team assigned to project",
  "team assigned to project.",
  "assigned team to a project",
  "assigned team to a project.",
  "project team assigned",
]);

const GENERIC_TEAM_REMOVED = new Set([
  "removed team from project.",
  "removed team from project",
  "team removed from project",
  "team removed from project.",
  "removed team from a project",
  "removed team from a project.",
  "project team removed",
]);

/** Role-suffixed grants like "Project access granted as Manager." are still incomplete. */
function isGenericMemberAssignedDescription(description: string): boolean {
  const normalized = description.trim().toLowerCase();
  if (GENERIC_MEMBER_ASSIGNED.has(normalized)) {
    return true;
  }
  return /^project access granted as .+\.?$/.test(normalized);
}

function isGenericDescription(description: string, generics: Set<string>): boolean {
  return generics.has(description.trim().toLowerCase());
}

/**
 * Prefer the stored description when it already names the subject.
 * When the description is a known generic phrase (or empty) and metadata carries
 * subject/team labels, rebuild the NEUD sentence. Never invent names.
 */
export function enrichAccessActivityDescription(input: {
  eventType?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
}): string | null {
  const type = (input.eventType ?? "").trim();
  const description = (input.description ?? "").trim();
  const metadata = input.metadata ?? undefined;

  const subjectLabel =
    readMetaString(metadata, "subjectLabel") ||
    resolveActivitySubjectLabel({
      fullName: readMetaString(metadata, "subjectFullName"),
      email: readMetaString(metadata, "subjectEmail"),
      userId: readMetaString(metadata, "subjectUserId"),
    });
  const hasRealSubject =
    Boolean(readMetaString(metadata, "subjectLabel")) ||
    Boolean(readMetaString(metadata, "subjectFullName")) ||
    Boolean(readMetaString(metadata, "subjectEmail")) ||
    Boolean(readMetaString(metadata, "subjectUserId"));

  const teamName = readMetaString(metadata, "teamName");

  if (
    type === "project.member_added" ||
    type === "access.project-assigned"
  ) {
    if (hasRealSubject && (!description || isGenericMemberAssignedDescription(description))) {
      return formatProjectAccessAssignedDescription(subjectLabel);
    }
    if (description && !isGenericMemberAssignedDescription(description)) {
      return description;
    }
    if (hasRealSubject) {
      return formatProjectAccessAssignedDescription(subjectLabel);
    }
    return description || null;
  }

  if (
    type === "project.member_removed" ||
    type === "access.project-unassigned"
  ) {
    if (hasRealSubject && (!description || isGenericDescription(description, GENERIC_MEMBER_REMOVED))) {
      return formatProjectAccessRemovedDescription(subjectLabel);
    }
    if (description && !isGenericDescription(description, GENERIC_MEMBER_REMOVED)) {
      // Legacy named form "Project access removed for Jane." → keep if already names subject,
      // but prefer the Pass 7 sentence when metadata is present.
      if (
        hasRealSubject &&
        /^project access removed for .+\.?$/i.test(description)
      ) {
        return formatProjectAccessRemovedDescription(subjectLabel);
      }
      return description;
    }
    if (hasRealSubject) {
      return formatProjectAccessRemovedDescription(subjectLabel);
    }
    return description || null;
  }

  if (
    type === "project.team_assigned" ||
    type === "access.project-team-assigned"
  ) {
    if (teamName && (!description || isGenericDescription(description, GENERIC_TEAM_ASSIGNED))) {
      return formatProjectTeamAssignedDescription(teamName);
    }
    if (description && !isGenericDescription(description, GENERIC_TEAM_ASSIGNED)) {
      // Legacy "{Team} assigned to project." → normalize when teamName is known.
      if (teamName && /assigned to project\.?$/i.test(description)) {
        return formatProjectTeamAssignedDescription(teamName);
      }
      return description;
    }
    if (teamName) {
      return formatProjectTeamAssignedDescription(teamName);
    }
    return description || null;
  }

  if (
    type === "project.team_removed" ||
    type === "access.project-team-removed"
  ) {
    if (teamName && (!description || isGenericDescription(description, GENERIC_TEAM_REMOVED))) {
      return formatProjectTeamRemovedDescription(teamName);
    }
    if (description && !isGenericDescription(description, GENERIC_TEAM_REMOVED)) {
      if (teamName && /removed from project\.?$/i.test(description)) {
        return formatProjectTeamRemovedDescription(teamName);
      }
      return description;
    }
    if (teamName) {
      return formatProjectTeamRemovedDescription(teamName);
    }
    return description || null;
  }

  return description || null;
}
