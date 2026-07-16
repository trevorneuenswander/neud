"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { AuthFormField } from "@/components/auth/AuthFormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { signIn } from "@/lib/auth/actions";
import { initialAuthState } from "@/lib/auth/state";

type LoginFormProps = {
  nextPath?: string;
};

export function LoginForm({ nextPath }: LoginFormProps) {
  const [state, formAction] = useActionState(signIn, initialAuthState);
  const [email, setEmail] = useState("");

  return (
    <form action={formAction} className="space-y-4">
      {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}

      <AuthFormField
        id="email"
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <AuthFormField
        id="password"
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
      />

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {state.error}
        </p>
      ) : null}

      <SubmitButton>Log in</SubmitButton>

      <div className="flex flex-col gap-2 text-sm text-zinc-600 dark:text-zinc-400">
        <Link
          href="/forgot-password"
          className="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-50"
        >
          Forgot your password?
        </Link>
        <p>
          Don&apos;t have an account?{" "}
          <Link
            href="/request-access"
            className="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-50"
          >
            Request access
          </Link>
        </p>
      </div>
    </form>
  );
}
