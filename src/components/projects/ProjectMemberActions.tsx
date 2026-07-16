"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import {
  PROJECT_ACCESS_LEVELS,
  PROJECT_ACCESS_LEVEL_LABELS,
  type ProjectAccessLevel,
} from "@/lib/projects/constants";
import {
  addProjectMember,
  removeProjectMember,
  updateProjectMember,
} from "@/lib/projects/actions";
import { initialProjectActionState } from "@/lib/projects/state";
import type { ProfileWithEmail } from "@/types/database";
import type { ProjectMemberRow } from "@/lib/projects/types";

type AddProjectMemberFormProps = {
  slug: string;
  assignableUsers: ProfileWithEmail[];
};

function AddMemberButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Adding…" : "Add member"}
    </Button>
  );
}

export function AddProjectMemberForm({
  slug,
  assignableUsers,
}: AddProjectMemberFormProps) {
  const [state, formAction] = useActionState(
    addProjectMember,
    initialProjectActionState,
  );

  return (
    <form action={formAction} className="rounded-lg border border-border bg-surface p-4">
      <input type="hidden" name="slug" value={slug} />
      <h3 className="text-sm font-semibold text-foreground">Add member</h3>
      <p className="mt-1 text-sm text-muted">
        Assign an existing approved user to this Project.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_180px_auto]">
        <div>
          <label htmlFor="userId" className="block text-sm font-medium text-foreground">
            User
          </label>
          <select
            id="userId"
            name="userId"
            required
            className="mt-2 block w-full cursor-pointer rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            defaultValue=""
          >
            <option value="" disabled>
              Select a user
            </option>
            {assignableUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {(user.full_name ?? user.email) + (user.company ? ` — ${user.company}` : "")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="accessLevel"
            className="block text-sm font-medium text-foreground"
          >
            Access level
          </label>
          <select
            id="accessLevel"
            name="accessLevel"
            defaultValue="operator"
            className="mt-2 block w-full cursor-pointer rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          >
            {PROJECT_ACCESS_LEVELS.map((level) => (
              <option key={level} value={level}>
                {PROJECT_ACCESS_LEVEL_LABELS[level]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <AddMemberButton />
        </div>
      </div>
      {state.error ? <div className="mt-4"><Alert variant="error">{state.error}</Alert></div> : null}
      {state.success ? <div className="mt-4"><Alert variant="success">{state.success}</Alert></div> : null}
    </form>
  );
}

type ProjectMemberActionsProps = {
  slug: string;
  member: ProjectMemberRow;
  managerCount: number;
};

function ActionButton({
  children,
  variant = "secondary",
  disabled = false,
}: {
  children: React.ReactNode;
  variant?: "secondary" | "danger";
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending || disabled}>
      {pending ? "Saving…" : children}
    </Button>
  );
}

export function ProjectMemberActions({
  slug,
  member,
  managerCount,
}: ProjectMemberActionsProps) {
  const [updateState, updateAction] = useActionState(
    updateProjectMember,
    initialProjectActionState,
  );
  const [removeState, removeAction] = useActionState(
    removeProjectMember,
    initialProjectActionState,
  );

  const isLastManager =
    member.access_level === "manager" && managerCount <= 1;
  const feedback =
    updateState.success ??
    updateState.error ??
    removeState.success ??
    removeState.error;

  return (
    <div className="space-y-2">
      <form action={updateAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="userId" value={member.user_id} />
        <select
          name="accessLevel"
          defaultValue={member.access_level}
          disabled={isLastManager}
          className="cursor-pointer rounded-md border border-border bg-surface-raised px-2 py-1 text-xs text-foreground outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {PROJECT_ACCESS_LEVELS.map((level: ProjectAccessLevel) => (
            <option key={level} value={level}>
              {PROJECT_ACCESS_LEVEL_LABELS[level]}
            </option>
          ))}
        </select>
        <ActionButton>Update</ActionButton>
      </form>
      <form action={removeAction}>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="userId" value={member.user_id} />
        <ActionButton variant="danger" disabled={isLastManager}>
          Remove
        </ActionButton>
      </form>
      {feedback ? (
        <Alert
          variant={
            updateState.success || removeState.success ? "success" : "error"
          }
        >
          {feedback}
        </Alert>
      ) : null}
    </div>
  );
}
