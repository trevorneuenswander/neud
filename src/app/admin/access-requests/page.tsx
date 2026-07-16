import { AccessRequestActions } from "@/components/access-requests/AccessRequestActions";
import { PageContainer } from "@/components/layout/PageContainer";
import { requireAdmin } from "@/lib/auth/authorization";
import { getAccessRequests } from "@/lib/access-requests/queries";
import type { AccessRequest } from "@/types/database";

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function RequestCard({ request }: { request: AccessRequest }) {
  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {request.full_name}
            </h2>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
              {request.status}
            </span>
          </div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {request.email}
          </p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {request.company}
          </p>
          {request.comments ? (
            <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              {request.comments}
            </p>
          ) : null}
          <p className="text-xs text-zinc-500 dark:text-zinc-500">
            Submitted {formatDate(request.created_at)}
          </p>
        </div>

        {request.status === "pending" ? (
          <AccessRequestActions requestId={request.id} />
        ) : null}
      </div>
    </article>
  );
}

export default async function AdminAccessRequestsPage() {
  await requireAdmin();

  const requests = await getAccessRequests();
  const pendingRequests = requests.filter((request) => request.status === "pending");
  const reviewedRequests = requests.filter((request) => request.status !== "pending");

  return (
    <PageContainer>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Access Requests
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Review portal access requests. Approved users receive an email
            invitation to set a password. They receive general portal access only
            and are not automatically assigned to any graphics projects.
          </p>
        </div>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Pending
          </h2>
          {pendingRequests.length > 0 ? (
            <div className="space-y-4">
              {pendingRequests.map((request) => (
                <RequestCard key={request.id} request={request} />
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-8 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
              No pending access requests.
            </p>
          )}
        </section>

        {reviewedRequests.length > 0 ? (
          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Reviewed
            </h2>
            <div className="space-y-4">
              {reviewedRequests.map((request) => (
                <RequestCard key={request.id} request={request} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </PageContainer>
  );
}
