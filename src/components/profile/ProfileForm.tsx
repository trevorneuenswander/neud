"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { updateOwnProfile, type ProfileActionState } from "@/lib/profile/actions";
import type { Profile } from "@/types/database";

type ProfileFormProps = {
  profile: Profile;
  email: string | null;
};

const initialState: ProfileActionState = {
  error: null,
  success: null,
};

export function ProfileForm({ profile, email }: ProfileFormProps) {
  const [state, formAction, pending] = useActionState(updateOwnProfile, initialState);

  return (
    <Card>
      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="fullName" className="block text-sm font-medium text-foreground">
            Name
          </label>
          <input
            id="fullName"
            name="fullName"
            type="text"
            defaultValue={profile.full_name ?? ""}
            placeholder="Name not set"
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
          />
          {!profile.full_name ? (
            <p className="mt-1 text-xs text-muted">Name not set</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-foreground">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            value={email ?? profile.email ?? ""}
            readOnly
            className="mt-1 w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-muted"
          />
        </div>

        <div>
          <label htmlFor="phoneNumber" className="block text-sm font-medium text-foreground">
            Phone Number
          </label>
          <input
            id="phoneNumber"
            name="phoneNumber"
            type="tel"
            defaultValue={profile.phone_number ?? ""}
            placeholder="—"
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
          />
        </div>

        <div>
          <label htmlFor="team" className="block text-sm font-medium text-foreground">
            Team
          </label>
          <input
            id="team"
            name="team"
            type="text"
            defaultValue={profile.team ?? ""}
            placeholder="—"
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
          />
        </div>

        {state.error ? <Alert variant="error">{state.error}</Alert> : null}
        {state.success ? <Alert variant="success">{state.success}</Alert> : null}

        <Button type="submit" size="sm" disabled={pending}>
          Save Profile
        </Button>
      </form>
    </Card>
  );
}
