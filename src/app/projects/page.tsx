import Link from "next/link";
import { PageContainer } from "@/components/layout/PageContainer";
import { requireAuth } from "@/lib/auth/session";

export default async function ProjectsPage() {
  await requireAuth();
  return (
    <PageContainer>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Projects
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Graphics projects will be listed here. Each project connects a
            controller, display URLs, and optional background workers.
          </p>
        </div>
        <Link
          href="/projects/new"
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          New project
        </Link>
      </div>
    </PageContainer>
  );
}
