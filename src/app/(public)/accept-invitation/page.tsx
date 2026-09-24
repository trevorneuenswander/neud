import { AcceptInvitationPanel } from "@/components/auth/AcceptInvitationPanel";
import { PublicPage } from "@/components/layout/PublicPage";
import { requireInviteSession } from "@/lib/auth/confirm";
import { splitFullNameForPrefill } from "@/lib/auth/invitation-acceptance-profile";
import { createClient } from "@/lib/supabase/server";

export default async function AcceptInvitationPage() {
  await requireInviteSession();

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;

  let initialFirstName = "";
  let initialLastName = "";
  let initialPhoneNumber = "";

  if (userId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, phone_number")
      .eq("id", userId)
      .maybeSingle();

    const split = splitFullNameForPrefill(profile?.full_name ?? null);
    initialFirstName = split.firstName;
    initialLastName = split.lastName;
    initialPhoneNumber = profile?.phone_number?.trim() ?? "";
  }

  return (
    <PublicPage
      title="Complete your NEUD account"
      description="Create your password and complete your profile to accept the invitation."
    >
      <AcceptInvitationPanel
        initialFirstName={initialFirstName}
        initialLastName={initialLastName}
        initialPhoneNumber={initialPhoneNumber}
      />
    </PublicPage>
  );
}
