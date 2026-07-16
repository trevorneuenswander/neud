"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  approveAccessRequest,
  rejectAccessRequest,
} from "@/lib/access-requests/admin-actions";
import { initialAdminActionState } from "@/lib/access-requests/state";

type AccessRequestActionsProps = {
  requestId: string;
};

function ApproveButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-9 items-center justify-center rounded-lg bg-zinc-900 px-3 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
    >
      {pending ? "Approving…" : "Approve"}
    </button>
  );
}

function RejectButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-300 px-3 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-70 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
    >
      {pending ? "Rejecting…" : "Reject"}
    </button>
  );
}

export function AccessRequestActions({ requestId }: AccessRequestActionsProps) {
  const [approveState, approveAction] = useActionState(
    approveAccessRequest,
    initialAdminActionState,
  );
  const [rejectState, rejectAction] = useActionState(
    rejectAccessRequest,
    initialAdminActionState,
  );

  const feedback = approveState.success ?? approveState.error ?? rejectState.success ?? rejectState.error;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <form action={approveAction}>
          <input type="hidden" name="requestId" value={requestId} />
          <ApproveButton />
        </form>
        <form action={rejectAction}>
          <input type="hidden" name="requestId" value={requestId} />
          <RejectButton />
        </form>
      </div>

      {feedback ? (
        <p
          role="status"
          className={`text-sm ${
            approveState.success || rejectState.success
              ? "text-emerald-700 dark:text-emerald-300"
              : "text-red-700 dark:text-red-300"
          }`}
        >
          {feedback}
        </p>
      ) : null}
    </div>
  );
}
