export type InvitationProfileFailureStage =
  | "unauthenticated"
  | "first_name_missing"
  | "last_name_missing"
  | "phone_missing"
  | "password_invalid"
  | "profile_load_failed"
  | "profile_update_failed"
  | "invitation_accept_failed"
  | "none";

export function buildFullNameFromParts(firstName: string, lastName: string): string {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

export function splitFullNameForPrefill(fullName: string | null | undefined): {
  firstName: string;
  lastName: string;
} {
  const normalized = (fullName ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) {
    return { firstName: "", lastName: "" };
  }
  const parts = normalized.split(" ");
  if (parts.length === 1) {
    return { firstName: parts[0] ?? "", lastName: "" };
  }
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

export function validateInvitedProfileFirstName(firstName: string): string | null {
  if (!firstName.trim()) {
    return "First name is required.";
  }
  return null;
}

export function validateInvitedProfileLastName(lastName: string): string | null {
  if (!lastName.trim()) {
    return "Last name is required.";
  }
  return null;
}

export function normalizePhoneForProfile(phone: string): string {
  return phone.trim();
}

export function validateInvitedProfilePhone(phone: string): string | null {
  const trimmed = normalizePhoneForProfile(phone);
  if (!trimmed) {
    return "Phone number is required.";
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7) {
    return "Enter a valid phone number.";
  }
  return null;
}

export function profileHasRequiredContactFields(profile: {
  full_name?: string | null;
  phone_number?: string | null;
} | null): boolean {
  if (!profile) {
    return false;
  }
  return Boolean(profile.full_name?.trim()) && Boolean(profile.phone_number?.trim());
}

export function invitedProfileFieldsRequired(profile: {
  full_name?: string | null;
  phone_number?: string | null;
} | null): boolean {
  return !profileHasRequiredContactFields(profile);
}
