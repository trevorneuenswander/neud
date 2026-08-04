"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { formatPlatformRole } from "@/lib/portal/navigation";
import { invitePlatformUser } from "@/lib/users/actions";
import {
  ADMIN_ASSIGNABLE_ROLES,
  initialUserActionState,
  OWNER_ASSIGNABLE_ROLES,
} from "@/lib/users/types";
import {
  PROJECT_ACCESS_LEVELS,
  PROJECT_ACCESS_LEVEL_LABELS,
} from "@/lib/projects/constants";
import type { ApplicationRole } from "@/lib/auth/application-roles";

type InviteUserFormProps = {
  actorRole: ApplicationRole;
  projects: Array<{ id: string; name: string; slug: string }>;
  localMode: boolean;
};

function InviteButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Sending invitation…" : "Invite user"}
    </Button>
  );
}

export function InviteUserForm({
  actorRole,
  projects,
  localMode,
}: InviteUserFormProps) {
  const [state, formAction] = useActionState(
    invitePlatformUser,
    initialUserActionState,
  );
  const assignableRoles =
    actorRole === "owner" ? OWNER_ASSIGNABLE_ROLES : ADMIN_ASSIGNABLE_ROLES;

  if (localMode) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4">
        <h3 className="text-sm font-semibold text-foreground">Invite user</h3>
        <p className="mt-2 text-sm text-muted">
          User invitations require hosted Supabase authentication. Manage users
          from the cloud-hosted portal, not desktop-only mode.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="rounded-lg border border-border bg-surface p-4">
      <h3 className="text-sm font-semibold text-foreground">Invite user</h3>
      <p className="mt-1 text-sm text-muted">
        Send an invitation link. The user sets their own password through the
        secure onboarding flow.
      </p>

      {state.error ? (
        <div className="mt-4">
          <Alert variant="error">{state.error}</Alert>
        </div>
      ) : null}
      {state.success ? (
        <div className="mt-4">
          <Alert variant="success">{state.success}</Alert>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="fullName" className="block text-sm font-medium text-foreground">
            Display name
          </label>
          <input
            id="fullName"
            name="fullName"
            required
            className="mt-2 block w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-foreground">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="mt-2 block w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="team" className="block text-sm font-medium text-foreground">
            Team
          </label>
          <input
            id="team"
            name="team"
            className="mt-2 block w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="role" className="block text-sm font-medium text-foreground">
            Application role
          </label>
          <select
            id="role"
            name="role"
            defaultValue="viewer"
            className="mt-2 block w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm"
          >
            {assignableRoles.map((role) => (
              <option key={role} value={role}>
                {formatPlatformRole(role)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {projects.length > 0 ? (
        <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
          <div>
            <label htmlFor="projectIds" className="block text-sm font-medium text-foreground">
              Initial project assignments
            </label>
            <select
              id="projectIds"
              name="projectIds"
              multiple
              className="mt-2 block min-h-28 w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm"
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="projectAccessLevel"
              className="block text-sm font-medium text-foreground"
            >
              Project access
            </label>
            <select
              id="projectAccessLevel"
              name="projectAccessLevel"
              defaultValue="viewer"
              className="mt-2 block w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm"
            >
              {PROJECT_ACCESS_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {PROJECT_ACCESS_LEVEL_LABELS[level]}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

      <div className="mt-4">
        <InviteButton />
      </div>
    </form>
  );
}
