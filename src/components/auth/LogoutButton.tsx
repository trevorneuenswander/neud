"use client";

import { useFormStatus } from "react-dom";
import { signOut } from "@/lib/auth/actions";

function LogoutButtonInner() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-70 dark:text-zinc-400 dark:hover:text-zinc-50"
    >
      {pending ? "Logging out…" : "Log out"}
    </button>
  );
}

export function LogoutButton() {
  return (
    <form action={signOut}>
      <LogoutButtonInner />
    </form>
  );
}
