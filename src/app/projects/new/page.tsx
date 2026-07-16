import Link from "next/link";
import { PageContainer } from "@/components/layout/PageContainer";
import { requireAuth } from "@/lib/auth/session";

export default async function NewProjectPage() {
  await requireAuth();
  return (
    <PageContainer>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        New project
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
        Project creation is not yet available. This page will let you choose a
        graphics project type and configure a new live graphics project.
      </p>
      <p className="mt-6">
        <Link
          href="/projects"
          className="text-sm font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-50"
        >
          Back to projects
        </Link>
      </p>
    </PageContainer>
  );
}
