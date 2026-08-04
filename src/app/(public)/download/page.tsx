import Link from "next/link";
import { AppVersion } from "@/components/branding/AppVersion";
import { PageHeader } from "@/components/portal/PageHeader";
import { Card } from "@/components/ui/Card";

export default function DownloadPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-10 sm:px-6 lg:px-8">
      <PageHeader
        title="Download NEUD Desktop"
        description="Install the authoritative desktop engine for scraping, control, editing, and publishing."
      />
      <Card className="space-y-4 p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Windows Alpha</h2>
            <p className="text-sm text-muted">Current release track for Alpha v0.1.0.</p>
          </div>
          <AppVersion placement="hero" />
        </div>
        <p className="text-sm text-muted">
          Hosted installer delivery is not wired on this preview yet. Use your packaged
          NEUD Desktop build from release artifacts until download delivery is enabled.
        </p>
        <Link href="/login" className="text-sm font-medium text-primary hover:underline">
          Already installed? Log in to the portal
        </Link>
      </Card>
      <Card className="space-y-3 p-6">
        <h2 className="text-base font-semibold text-foreground">macOS</h2>
        <p className="text-sm text-muted">Coming in Beta.</p>
      </Card>
    </div>
  );
}
