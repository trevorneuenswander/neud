"use client";

import { useActionState, useRef, useState } from "react";
import type { FormEvent } from "react";
import { AuthFormField } from "@/components/auth/AuthFormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { acceptInvitation } from "@/lib/auth/actions";
import { initialAuthState } from "@/lib/auth/state";

type AcceptInvitationPanelProps = {
  initialFirstName?: string;
  initialLastName?: string;
  initialPhoneNumber?: string;
};

export function AcceptInvitationPanel({
  initialFirstName = "",
  initialLastName = "",
  initialPhoneNumber = "",
}: AcceptInvitationPanelProps) {
  const [state, formAction] = useActionState(acceptInvitation, initialAuthState);
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [phoneNumber, setPhoneNumber] = useState(initialPhoneNumber);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mismatchError, setMismatchError] = useState<string | null>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);

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
        id="firstName"
        label="First Name"
        name="firstName"
        type="text"
        autoComplete="given-name"
        required
        value={firstName}
        onChange={(event) => setFirstName(event.target.value)}
      />
      <AuthFormField
        id="lastName"
        label="Last Name"
        name="lastName"
        type="text"
        autoComplete="family-name"
        required
        value={lastName}
        onChange={(event) => setLastName(event.target.value)}
      />
      <AuthFormField
        id="phoneNumber"
        label="Phone Number"
        name="phoneNumber"
        type="tel"
        autoComplete="tel"
        required
        value={phoneNumber}
        onChange={(event) => setPhoneNumber(event.target.value)}
      />
      <AuthFormField
        id="password"
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        value={password}
        onChange={(event) => {
          setPassword(event.target.value);
          if (mismatchError) {
            setMismatchError(null);
          }
        }}
      />
      <AuthFormField
        id="confirmPassword"
        label="Confirm Password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        value={confirmPassword}
        onChange={(event) => {
          setConfirmPassword(event.target.value);
          if (mismatchError) {
            setMismatchError(null);
          }
        }}
        inputRef={confirmPasswordRef}
      />

      {mismatchError ? <Alert variant="error">{mismatchError}</Alert> : null}
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}

      <SubmitButton pendingLabel="Accepting invitation…">Accept Invitation</SubmitButton>
    </form>
  );
}
