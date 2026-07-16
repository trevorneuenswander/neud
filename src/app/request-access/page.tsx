import { RequestAccessForm } from "@/components/access-requests/RequestAccessForm";
import { PageContainer } from "@/components/layout/PageContainer";
import { redirectIfAuthenticated } from "@/lib/auth/session";

export default async function RequestAccessPage() {
  await redirectIfAuthenticated();

  return (
    <PageContainer>
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Request Access
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Tell us about yourself and how your organization plans to use HMG
          Graphics Server.
        </p>
        <div className="mt-6">
          <RequestAccessForm />
        </div>
      </div>
    </PageContainer>
  );
}
