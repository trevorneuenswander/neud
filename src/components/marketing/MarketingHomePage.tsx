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
          Local-first live graphics for production teams
        </h1>
        <p className="mx-auto max-w-2xl text-base leading-7 text-muted">
          NEUD Desktop is where you scrape, control, edit, and publish graphics.
          The web portal lets authorized viewers watch displays you explicitly publish online.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/download"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Download Desktop
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
          <h2 className="text-sm font-semibold text-foreground">Desktop engine</h2>
          <p className="mt-2 text-sm text-muted">
            Run scrapers, Local Controller, displays, and publishing from the authoritative desktop app.
          </p>
        </Card>
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-foreground">Online viewers</h2>
          <p className="mt-2 text-sm text-muted">
            Enable online viewing per display from desktop. Remote viewers watch published output only.
          </p>
        </Card>
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-foreground">Windows Alpha</h2>
          <p className="mt-2 text-sm text-muted">
            Windows Alpha is available now. macOS packaging is planned for Beta.
          </p>
        </Card>
      </section>
    </div>
  );
}
