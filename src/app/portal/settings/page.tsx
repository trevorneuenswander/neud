import Link from "next/link";
import { PageHeader } from "@/components/portal/PageHeader";
import { Card } from "@/components/ui/Card";
import { requireUser } from "@/lib/auth/authorization";
import { formatPlatformRole } from "@/lib/portal/navigation";
import { HOSTED_PORTAL_PATHS } from "@/lib/routing/hosted-routes";

export default async function HostedSettingsPage() {
  const { profile } = await requireUser();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Settings"
        description="Account and portal preferences for your NEUD cloud account."
      />

      <Card className="space-y-4 p-6">
        <h2 className="text-base font-semibold text-foreground">Account</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Name</p>
            <p className="mt-1 text-sm text-foreground">{profile.full_name ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Email</p>
            <p className="mt-1 text-sm text-foreground">{profile.email ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Role</p>
            <p className="mt-1 text-sm text-foreground">{formatPlatformRole(profile.role)}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href={HOSTED_PORTAL_PATHS.profile} className="text-sm text-primary hover:underline">
            View profile
          </Link>
          <Link href="/login?reset=1" className="text-sm text-primary hover:underline">
            Reset password
          </Link>
        </div>
      </Card>

      <Card className="space-y-3 p-6">
        <h2 className="text-base font-semibold text-foreground">Download</h2>
        <p className="text-sm text-muted">
          Install the NEUD desktop app to publish displays, run data engines, and manage projects
          locally.
        </p>
        <Link
          href={HOSTED_PORTAL_PATHS.download}
          className="inline-flex text-sm font-medium text-primary hover:underline"
        >
          Download Desktop
        </Link>
      </Card>
    </div>
  );
}
