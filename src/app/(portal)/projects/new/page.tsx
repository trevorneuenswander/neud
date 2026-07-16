import { Alert } from "@/components/ui/Alert";
import { FormField } from "@/components/ui/FormField";
import { PageHeader } from "@/components/portal/PageHeader";
import { requireUser } from "@/lib/auth/authorization";

export default async function NewProjectPage() {
  await requireUser();

  return (
    <div className="space-y-8">
      <PageHeader
        title="New Project"
        description="Project creation is not yet available. This page previews the fields that will be used when the backend is implemented."
      />
      <Alert variant="info">
        Project creation is not yet available. Fields below are disabled
        previews only — nothing will be saved.
      </Alert>
      <div className="max-w-lg space-y-4">
        <FormField
          id="project-name"
          name="project-name"
          label="Project name"
          placeholder="e.g. Saturday Auction"
          required={false}
          disabled
        />
        <FormField
          id="project-description"
          name="project-description"
          label="Description"
          placeholder="Brief description of this Project"
          required={false}
          disabled
        />
        <FormField
          id="project-type"
          name="project-type"
          label="Project type"
          placeholder="Not configured"
          required={false}
          disabled
        />
      </div>
    </div>
  );
}
