import { NewProjectForm } from "@/components/projects/NewProjectForm";
import { PageHeader } from "@/components/portal/PageHeader";
import { requireProjectCreationAccess } from "@/lib/projects/authorization";

export default async function NewProjectPage() {
  await requireProjectCreationAccess();

  return (
    <div className="space-y-8">
      <PageHeader
        title="New Project"
        description="Create a new production workspace. The Project slug is generated automatically and remains stable after creation."
      />
      <NewProjectForm />
    </div>
  );
}
