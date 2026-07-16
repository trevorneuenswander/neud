import { AccessRequestActions } from "@/components/access-requests/AccessRequestActions";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { AccessRequest } from "@/types/database";

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

type AccessRequestCardProps = {
  request: AccessRequest;
};

export function AccessRequestCard({ request }: AccessRequestCardProps) {
  return (
    <Card>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">
              {request.full_name}
            </h2>
            <StatusBadge status={request.status} />
          </div>
          <p className="break-all text-sm text-muted">{request.email}</p>
          <p className="break-words text-sm text-muted">{request.company}</p>
          {request.comments ? (
            <p className="break-words text-sm leading-6 text-muted">
              {request.comments}
            </p>
          ) : null}
          <p className="text-xs text-muted">
            Submitted {formatDate(request.created_at)}
          </p>
        </div>

        {request.status === "pending" ? (
          <div className="shrink-0">
            <AccessRequestActions requestId={request.id} />
          </div>
        ) : null}
      </div>
    </Card>
  );
}
