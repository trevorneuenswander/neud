import { PageContainer } from "@/components/layout/PageContainer";

export default function DashboardPage() {
  return (
    <PageContainer>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Dashboard
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
        Your project overview will appear here after authentication is added.
        The dashboard will summarize active graphics projects, worker status,
        and recent activity.
      </p>
    </PageContainer>
  );
}
