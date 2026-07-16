"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AuthFormField } from "@/components/auth/AuthFormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import {
  initialAuthState,
} from "@/lib/auth/state";
import {
  signUp,
} from "@/lib/auth/actions";

export function SignupForm() {
  const [state, formAction] = useActionState(signUp, initialAuthState);

  return (
    <form action={formAction} className="space-y-4">
      <AuthFormField
        id="email"
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
      />
      <AuthFormField
        id="password"
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
      />
      <AuthFormField
        id="confirmPassword"
        label="Confirm password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
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

      <SubmitButton>Create account</SubmitButton>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Already have an account?{" "}
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
