import Link from "next/link";
import { NeudLogo } from "@/components/branding/NeudLogo";
import { AppVersion } from "@/components/branding/AppVersion";
import { Card } from "@/components/ui/Card";

export function MarketingHomePage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-12 px-4 py-12 sm:px-6 lg:px-8">
      <section className="space-y-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <NeudLogo size="hero" showTagline href={null} />
          <AppVersion placement="hero" />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Professional live graphics and data integration
        </h1>
        <p className="mx-auto max-w-2xl text-base leading-7 text-muted">
          A professional live graphics and data integration platform built for broadcast and
          live production. Run NEUD Desktop locally to integrate data, control graphics, and
          deliver output — then publish selected displays for authorized online viewers.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/download"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Get NEUD
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground"
          >
            Log in to Portal
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-foreground">Local-first desktop</h2>
          <p className="mt-2 text-sm text-muted">
            Integrate external data, operate manual controls, manage displays, and publish from
            the authoritative desktop application.
          </p>
        </Card>
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-foreground">Modular workflows</h2>
          <p className="mt-2 text-sm text-muted">
            Configure data sources, graphics, and delivery paths to match your production —
            without tying the platform to a single show format.
          </p>
        </Card>
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-foreground">Cross-platform Alpha</h2>
          <p className="mt-2 text-sm text-muted">
            NEUD Alpha 0.3.0 is available for Windows x64 and Apple Silicon Macs. Download the
            installer for your platform from the download page.
          </p>
        </Card>
      </section>
    </div>
  );
}
