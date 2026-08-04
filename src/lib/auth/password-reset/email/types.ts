export type PasswordResetEmailInput = {
  to: string;
  resetUrl: string;
};

export type PasswordResetEmailResult = {
  ok: boolean;
  error?: string;
};

export type PasswordResetEmailProvider = {
  readonly name: string;
  readonly isConfigured: boolean;
  sendPasswordResetEmail(
    input: PasswordResetEmailInput,
  ): Promise<PasswordResetEmailResult>;
};

export type PasswordResetEmailDiagnostics = {
  configured: boolean;
  provider: string;
  message: string | null;
};
