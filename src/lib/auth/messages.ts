const PAGE_MESSAGES: Record<string, string> = {
  "confirmation-failed":
    "Email confirmation failed. Request a new link and try again.",
  "invitation-invalid":
    "This invitation link is invalid or has expired. Ask an administrator to send a new invitation.",
  "recovery-required":
    "Use the password reset link from your email to update your password.",
  "invite-required":
    "Use the invitation link from your email to set up your account.",
  "password-updated":
    "Your password has been updated. Log in with your new password.",
};

export function getPageMessage(
  key: string | undefined,
): string | null {
  if (!key) {
    return null;
  }

  return PAGE_MESSAGES[key] ?? null;
}
