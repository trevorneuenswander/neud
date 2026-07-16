"use client";

import { useActionState } from "react";
import { AuthFormField } from "@/components/auth/AuthFormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import {
  initialAuthState,
} from "@/lib/auth/state";
import {
  updatePassword,
} from "@/lib/auth/actions";

export function UpdatePasswordForm() {
  const [state, formAction] = useActionState(updatePassword, initialAuthState);

  return (
    <form action={formAction} className="space-y-4">
      <AuthFormField
        id="password"
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
      />
      <AuthFormField
        id="confirmPassword"
        label="Confirm new password"
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

      <SubmitButton>Update password</SubmitButton>
    </form>
  );
}
