import { UpdatePasswordForm } from "@/components/auth/UpdatePasswordForm";
import { PageContainer } from "@/components/layout/PageContainer";
import { requireRecoverySession } from "@/lib/auth/confirm";

export default async function UpdatePasswordPage() {
  await requireRecoverySession();

  return (
    <PageContainer>
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Update password
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Choose a new password for your account.
        </p>
        <div className="mt-6">
          <UpdatePasswordForm />
        </div>
      </div>
    </PageContainer>
  );
}
