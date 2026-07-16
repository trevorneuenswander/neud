import { PageHeader } from "@/components/portal/PageHeader";

type ProjectPlaceholderPageProps = {
  title: string;
  description: string;
};

export function ProjectPlaceholderPage({
  title,
  description,
}: ProjectPlaceholderPageProps) {
  return (
    <div className="space-y-4">
      <PageHeader title={title} description={description} />
      <div className="rounded-lg border border-dashed border-border bg-surface px-6 py-10 text-center">
        <p className="text-sm text-muted">Not configured in this phase.</p>
      </div>
    </div>
  );
}
