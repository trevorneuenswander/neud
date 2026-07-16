import { UpdatePasswordForm } from "@/components/auth/UpdatePasswordForm";
import { PublicPage } from "@/components/layout/PublicPage";
import { requireRecoverySession } from "@/lib/auth/confirm";

export default async function UpdatePasswordPage() {
  await requireRecoverySession();

  return (
    <PublicPage
      title="Update password"
      description="Choose a new password for your account."
    >
      <UpdatePasswordForm />
    </PublicPage>
  );
}
