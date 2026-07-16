"use client";

import { useActionState, useRef, useState } from "react";
import type { FormEvent } from "react";
import { AuthFormField } from "@/components/auth/AuthFormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { acceptInvitation } from "@/lib/auth/actions";
import { initialAuthState } from "@/lib/auth/state";

export function AcceptInvitationForm() {
  const [state, formAction] = useActionState(acceptInvitation, initialAuthState);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mismatchError, setMismatchError] = useState<string | null>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    if (mismatchError) {
      setMismatchError(null);
    }
  };

  const handleConfirmPasswordChange = (value: string) => {
    setConfirmPassword(value);
    if (mismatchError) {
      setMismatchError(null);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (password !== confirmPassword) {
      event.preventDefault();
      setMismatchError("Passwords do not match.");
      confirmPasswordRef.current?.focus();
      return;
    }

    setMismatchError(null);
  };

  return (
    <form action={formAction} onSubmit={handleSubmit} className="space-y-4">
      <AuthFormField
        id="password"
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(event) => handlePasswordChange(event.target.value)}
      />
      <AuthFormField
        id="confirmPassword"
        label="Confirm password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        value={confirmPassword}
        onChange={(event) => handleConfirmPasswordChange(event.target.value)}
        inputRef={confirmPasswordRef}
      />

      {mismatchError ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {mismatchError}
        </p>
      ) : null}

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {state.error}
        </p>
      ) : null}

      <SubmitButton>Set password</SubmitButton>
    </form>
  );
}
