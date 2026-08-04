"use client";

import { useActionState, useRef, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { PasswordField } from "@/components/auth/PasswordField";
import { PasswordStrengthIndicator } from "@/components/auth/PasswordStrengthIndicator";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { completePasswordResetAction } from "@/lib/auth/password-reset-actions";
import { initialAuthState } from "@/lib/auth/state";
import { validatePassword, validatePasswordConfirmation } from "@/lib/auth/validation";

type ResetPasswordFormProps = {
  token: string;
};

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const [state, formAction] = useActionState(
    completePasswordResetAction,
    initialAuthState,
  );
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    const passwordError = validatePassword(password);
    if (passwordError) {
      event.preventDefault();
      setClientError(passwordError);
      return;
    }

    const confirmationError = validatePasswordConfirmation(
      password,
      confirmPassword,
    );
    if (confirmationError) {
      event.preventDefault();
      setClientError(confirmationError);
      confirmPasswordRef.current?.focus();
      return;
    }

    setClientError(null);
  };

  if (state.success) {
    return (
      <div className="space-y-4">
        <Alert variant="success">{state.success}</Alert>
        <Button href="/" className="w-full">
          Return to Sign In
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      <PasswordField
        id="password"
        label="New Password"
        name="password"
        value={password}
        onChange={(value) => {
          setPassword(value);
          if (clientError) {
            setClientError(null);
          }
        }}
      />

      <PasswordStrengthIndicator password={password} />

      <PasswordField
        id="confirmPassword"
        label="Confirm Password"
        name="confirmPassword"
        value={confirmPassword}
        onChange={(value) => {
          setConfirmPassword(value);
          if (clientError) {
            setClientError(null);
          }
        }}
        inputRef={confirmPasswordRef}
      />

      {clientError ? <Alert variant="error">{clientError}</Alert> : null}
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}

      <SubmitButton>Update Password</SubmitButton>

      <p className="text-sm text-muted">
        Need a new link?{" "}
        <Link
          href="/forgot-password"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Request reset email
        </Link>
      </p>
    </form>
  );
}
