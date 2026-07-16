import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/portal/PageHeader";
import { requireAdmin } from "@/lib/auth/authorization";

export default async function UsersPage() {
  await requireAdmin();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Users"
        description="Manage platform users and roles. User management is not yet configured."
      />
      <EmptyState
        title="User management not yet available"
        description="User listing and role management will appear here once the platform user directory is implemented."
      />
    </div>
  );
}
