"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthFormField } from "@/components/auth/AuthFormField";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { signInWithCredentials } from "@/lib/auth/client-sign-in";
import { requiresDesktopMainSessionHandoff } from "@/lib/auth/desktop-session-handoff";
import { validateEmail, validatePassword } from "@/lib/auth/validation";

type LoginFormProps = {
  nextPath?: string;
};

export function LoginForm({ nextPath = "/portal" }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const emailError = validateEmail(email);
    if (emailError) {
      setError(
        "Enter the email address provided by your administrator.",
      );
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setSubmitting(true);

    try {
      await signInWithCredentials(email, password);
      if (requiresDesktopMainSessionHandoff()) {
        router.push(nextPath);
        router.refresh();
        return;
      }
      window.location.assign(nextPath);
    } catch (signInError) {
      setError(
        signInError instanceof Error
          ? signInError.message
          : "Unable to sign in. Check your credentials and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Sign In</h2>
      </div>

      <AuthFormField
        id="email"
        label="Email / Username"
        name="email"
        type="email"
        autoComplete="username"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        disabled={submitting}
      />
      <AuthFormField
        id="password"
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        disabled={submitting}
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? "Signing in…" : "Sign In"}
      </Button>

      <p className="text-center text-sm">
        <Link
          href="/forgot-password"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Forgot Password?
        </Link>
      </p>

      <div className="border-t border-border pt-4 text-sm text-muted">
        <p className="font-medium text-foreground">Need an account?</p>
        <p className="mt-1">Contact your system administrator.</p>
      </div>
    </form>
  );
}
