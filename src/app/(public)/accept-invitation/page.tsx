import { AcceptInvitationForm } from "@/components/auth/AcceptInvitationForm";
import { PublicPage } from "@/components/layout/PublicPage";
import { requireInviteSession } from "@/lib/auth/confirm";

export default async function AcceptInvitationPage() {
  await requireInviteSession();

  return (
    <PublicPage
      title="Set your password"
      description="Create a password for your HMG Graphics Server account. After setting your password, you will have general portal access. Project access will be assigned separately by a platform administrator."
    >
      <AcceptInvitationForm />
    </PublicPage>
  );
}
