"use client";

import { useActionState, useRef, useState } from "react";
import type { FormEvent } from "react";
import { AuthFormField } from "@/components/auth/AuthFormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { Alert } from "@/components/ui/Alert";
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

      {mismatchError ? <Alert variant="error">{mismatchError}</Alert> : null}

      {state.error ? <Alert variant="error">{state.error}</Alert> : null}

      <SubmitButton>Set password</SubmitButton>
    </form>
  );
}
