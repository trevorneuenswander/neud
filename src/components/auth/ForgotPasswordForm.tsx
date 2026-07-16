"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { AuthFormField } from "@/components/auth/AuthFormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { requestPasswordReset } from "@/lib/auth/actions";
import { initialAuthState } from "@/lib/auth/state";

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(
    requestPasswordReset,
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

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {state.error}
        </p>
      ) : null}

      {state.success ? (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
        >
          {state.success}
        </p>
      ) : null}

      <SubmitButton>Send reset link</SubmitButton>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Remember your password?{" "}
        <Link
          href="/login"
          className="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-50"
        >
          Log in
        </Link>
      </p>
    </form>
  );
}
