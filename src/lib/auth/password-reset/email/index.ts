import "server-only";

import type {
  PasswordResetEmailDiagnostics,
  PasswordResetEmailProvider,
} from "@/lib/auth/password-reset/email/types";

function maskEmail(email: string): string {
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) {
    return "[invalid-email]";
  }

  if (localPart.length <= 2) {
    return `${localPart[0] ?? "*"}*@${domain}`;
  }

  return `${localPart.slice(0, 2)}***@${domain}`;
}

class DevLogPasswordResetEmailProvider implements PasswordResetEmailProvider {
  readonly name = "dev-log";
  readonly isConfigured = true;

  async sendPasswordResetEmail(input: {
    to: string;
    resetUrl: string;
  }) {
    if (process.env.NODE_ENV === "development") {
      console.info(
        `[password-reset] Reset link for ${maskEmail(input.to)}: ${input.resetUrl}`,
      );
    }

    return { ok: true };
  }
}

class UnconfiguredPasswordResetEmailProvider
  implements PasswordResetEmailProvider
{
  readonly name = "none";
  readonly isConfigured = false;

  async sendPasswordResetEmail() {
    return {
      ok: false,
      error:
        "Password reset email is not configured. Set NEUD_EMAIL_PROVIDER or configure an email provider.",
    };
  }
}

let cachedProvider: PasswordResetEmailProvider | null = null;

function resolveProviderName(): string {
  const configured =
    process.env.NEUD_EMAIL_PROVIDER?.trim().toLowerCase();

  if (configured) {
    return configured;
  }

  if (process.env.NODE_ENV === "development") {
    return "dev-log";
  }

  return "none";
}

export function getPasswordResetEmailProvider(): PasswordResetEmailProvider {
  if (cachedProvider) {
    return cachedProvider;
  }

  const providerName = resolveProviderName();

  switch (providerName) {
    case "dev-log":
      cachedProvider = new DevLogPasswordResetEmailProvider();
      break;
    case "none":
    default:
      cachedProvider = new UnconfiguredPasswordResetEmailProvider();
      break;
  }

  return cachedProvider;
}

export function getPasswordResetEmailDiagnostics(): PasswordResetEmailDiagnostics {
  const provider = getPasswordResetEmailProvider();

  if (provider.isConfigured) {
    return {
      configured: true,
      provider: provider.name,
      message: null,
    };
  }

  return {
    configured: false,
    provider: provider.name,
    message:
      "Password reset email is not configured. Users can request resets, but no email will be sent until NEUD_EMAIL_PROVIDER is configured.",
  };
}

export function resetPasswordResetEmailProviderCache() {
  cachedProvider = null;
}
