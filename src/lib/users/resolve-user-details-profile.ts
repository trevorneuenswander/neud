import { formatPlatformRole } from "@/lib/portal/navigation";
import type { PlatformRole } from "@/lib/access/types";

export { formatPlatformRole as formatPlatformRoleLabel };

export type UserDetailsSource = "supabase" | "local-cache";

export type NormalizedUserDetailsFields = {
  fullName: string;
  email: string;
  phoneNumber: string | null;
  teamName: string | null;
  platformRole: PlatformRole;
  roleLabel: string;
  source: UserDetailsSource;
};

function pickTrimmed(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return null;
}

export function resolveUserDetailsFields(input: {
  localFullName?: string | null;
  localEmail?: string | null;
  localPhone?: string | null;
  localProfileTeam?: string | null;
  localPlatformRole?: PlatformRole | null;
  supabaseFullName?: string | null;
  supabaseEmail?: string | null;
  supabasePhoneNumber?: string | null;
  supabaseTeam?: string | null;
  supabaseRole?: string | null;
  source: UserDetailsSource;
}): NormalizedUserDetailsFields {
  const fullName =
    pickTrimmed(input.supabaseFullName, input.localFullName) ?? "Name not set";
  const email = pickTrimmed(input.supabaseEmail, input.localEmail) ?? "Not provided";
  const phoneNumber = pickTrimmed(input.supabasePhoneNumber, input.localPhone);
  const teamName = pickTrimmed(input.supabaseTeam, input.localProfileTeam);
  const roleLabel = formatPlatformRole(
    pickTrimmed(input.supabaseRole, input.localPlatformRole ?? null) ?? "viewer",
  );
  const platformRole = mapToLocalPlatformRole(
    pickTrimmed(input.supabaseRole, input.localPlatformRole ?? null) ?? "viewer",
  );

  return {
    fullName,
    email,
    phoneNumber,
    teamName,
    platformRole,
    roleLabel,
    source: input.source,
  };
}

function mapToLocalPlatformRole(value: string): PlatformRole {
  return value.trim().toLowerCase() === "owner" ? "owner" : "user";
}
