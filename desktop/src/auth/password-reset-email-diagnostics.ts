export type PasswordResetEmailDiagnostics = {
  configured: boolean;
  provider: string;
  message: string | null;
};

export function getPasswordResetEmailDiagnostics(): PasswordResetEmailDiagnostics {
  const configuredProvider =
    process.env.NEUD_EMAIL_PROVIDER?.trim().toLowerCase();
  const provider =
    configuredProvider ??
    (process.env.NODE_ENV === "development" ? "dev-log" : "none");

  if (provider === "dev-log") {
    return {
      configured: true,
      provider,
      message: null,
    };
  }

  if (provider === "none") {
    return {
      configured: false,
      provider,
      message:
        "Password reset email is not configured. Users can request resets, but no email will be sent until NEUD_EMAIL_PROVIDER is configured.",
    };
  }

  return {
    configured: false,
    provider,
    message: `Password reset email provider "${provider}" is not implemented yet. Configure a supported provider or use dev-log in development.`,
  };
}
