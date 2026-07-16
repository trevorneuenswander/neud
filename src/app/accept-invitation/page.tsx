import { AcceptInvitationForm } from "@/components/auth/AcceptInvitationForm";
import { PageContainer } from "@/components/layout/PageContainer";
import { requireInviteSession } from "@/lib/auth/confirm";

export default async function AcceptInvitationPage() {
  await requireInviteSession();

  return (
    <PageContainer>
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Set your password
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Create a password for your HMG Graphics Server account. After setting
          your password, you will have general portal access. Project access will
          be assigned separately by a platform administrator.
        </p>
        <div className="mt-6">
          <AcceptInvitationForm />
        </div>
      </div>
    </PageContainer>
  );
}
