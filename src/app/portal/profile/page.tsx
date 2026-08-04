import { PageHeader } from "@/components/portal/PageHeader";
import { Card } from "@/components/ui/Card";
import { requireUser } from "@/lib/auth/authorization";

export default async function HostedProfilePage() {
  const { profile } = await requireUser();

  return (
    <div className="space-y-8">
      <PageHeader title="Profile" description="Your NEUD cloud portal account." />
      <Card className="space-y-2 p-6">
        <p className="text-sm text-muted">Name</p>
        <p className="text-base text-foreground">{profile.full_name ?? "—"}</p>
        <p className="pt-4 text-sm text-muted">Role</p>
        <p className="text-base text-foreground">{profile.role}</p>
      </Card>
    </div>
  );
}
