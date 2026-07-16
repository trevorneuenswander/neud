import { AccessRequestCard } from "@/components/access-requests/AccessRequestCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/portal/PageHeader";
import { PageSection } from "@/components/portal/PageSection";
import { getAccessRequests } from "@/lib/access-requests/queries";
import { requireAdmin } from "@/lib/auth/authorization";

export default async function AdminAccessRequestsPage() {
  await requireAdmin();

  const requests = await getAccessRequests();
  const pendingRequests = requests.filter(
    (request) => request.status === "pending",
  );
  const reviewedRequests = requests.filter(
    (request) => request.status !== "pending",
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Access Requests"
        description="Review portal access requests. Approved users receive an email invitation to set a password. They receive general portal access only and are not automatically assigned to any Projects."
      />

      <PageSection title="Pending">
        {pendingRequests.length > 0 ? (
          <div className="space-y-4">
            {pendingRequests.map((request) => (
              <AccessRequestCard key={request.id} request={request} />
            ))}
          </div>
        ) : (
          <EmptyState title="No pending access requests" />
        )}
      </PageSection>

      {reviewedRequests.length > 0 ? (
        <PageSection title="Reviewed">
          <div className="space-y-4">
            {reviewedRequests.map((request) => (
              <AccessRequestCard key={request.id} request={request} />
            ))}
          </div>
        </PageSection>
      ) : null}
    </div>
  );
}
