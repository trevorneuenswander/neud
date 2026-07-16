"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
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
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Approving…" : "Approve"}
    </Button>
  );
}

function RejectButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="secondary" size="sm" disabled={pending}>
      {pending ? "Rejecting…" : "Reject"}
    </Button>
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
        <Alert
          variant={
            approveState.success || rejectState.success ? "success" : "error"
          }
        >
          {feedback}
        </Alert>
      ) : null}
    </div>
  );
}
