"use client";

import { useFormStatus } from "react-dom";
import { signOut } from "@/lib/auth/actions";

function LogoutButtonInner() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="cursor-pointer text-sm font-medium text-muted transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-70"
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
