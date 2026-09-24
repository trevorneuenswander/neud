/** Mirror of shared/auth/invitation-acceptance-profile.ts */

export function buildFullNameFromParts(firstName, lastName) {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

export function validateInvitedProfileFirstName(firstName) {
  if (!firstName.trim()) {
    return "First name is required.";
  }
  return null;
}

export function validateInvitedProfileLastName(lastName) {
  if (!lastName.trim()) {
    return "Last name is required.";
  }
  return null;
}

export function validateInvitedProfilePhone(phone) {
  const trimmed = phone.trim();
  if (!trimmed) {
    return "Phone number is required.";
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7) {
    return "Enter a valid phone number.";
  }
  return null;
}
