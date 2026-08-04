"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { AuthFormField } from "@/components/auth/AuthFormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { requestPasswordResetAction } from "@/lib/auth/password-reset-actions";
import { initialAuthState } from "@/lib/auth/state";

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(
    requestPasswordResetAction,
    initialAuthState,
  );
  const [email, setEmail] = useState("");

  return (
    <form action={formAction} className="space-y-4">
      <AuthFormField
        id="email"
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />

      {state.error ? <Alert variant="error">{state.error}</Alert> : null}

      {state.success ? <Alert variant="success">{state.success}</Alert> : null}

      <SubmitButton>Send Reset Link</SubmitButton>

      <p className="text-sm text-muted">
        Remember your password?{" "}
        <Link
          href="/"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
