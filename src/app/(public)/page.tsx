import { HmgHeroLogoServer } from "@/components/branding/HmgHeroLogoServer";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

const features = [
  {
    title: "Project management",
    description:
      "Create and organize Projects from a single operational portal.",
  },
  {
    title: "Web controllers",
    description:
      "Operate live graphics with project-specific control panels.",
  },
  {
    title: "vMix-ready displays",
    description:
      "Copy display URLs into broadcast software for transparent overlays.",
  },
  {
    title: "Worker monitoring",
    description:
      "Track data sources and background workers from one place.",
  },
] as const;

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <div className="max-w-2xl">
            <HmgHeroLogoServer />
            <p className="mt-8 text-lg leading-8 text-muted">
              Centralized control for HMG&apos;s live graphics.
            </p>
            <p className="mt-4 text-base leading-7 text-muted">
              A reusable platform for managing Projects, operating controllers,
              previewing displays, and connecting to data sources.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button href="/login">Log in</Button>
              <Button href="/request-access" variant="secondary">
                Request Access
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="flex-1">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Platform capabilities
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            {features.map(({ title, description }) => (
              <Card key={title}>
                <h3 className="text-base font-semibold text-foreground">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
