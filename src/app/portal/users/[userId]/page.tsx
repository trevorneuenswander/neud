import { UserDetailsState, UserDetailsView } from "@/components/users/UserDetailsView";
import { buildCloudUserDetailsProfile } from "@/lib/access-management/user-details";
import { resolveSafeUsersReturnHref } from "@/lib/access-management/routes";
import { fetchAccessManagementDirectory } from "@/lib/access-management/directory-client";
import { requireAdmin } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";

type HostedUserDetailsPageProps = {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ returnTo?: string }>;
};

export default async function HostedUserDetailsPage({
  params,
  searchParams,
}: HostedUserDetailsPageProps) {
  await requireAdmin();
  const { userId } = await params;
  const { returnTo } = await searchParams;
  const backHref = resolveSafeUsersReturnHref(returnTo, "portal");

  if (!userId?.trim()) {
    return (
      <UserDetailsState
        title="User not found"
        description="A valid user identifier is required."
        backHref={backHref}
      />
    );
  }

  const supabase = await createClient();
  let profile = null;

  try {
    const directory = await fetchAccessManagementDirectory(supabase);
    profile = buildCloudUserDetailsProfile(userId, directory);
  } catch {
    profile = null;
  }

  if (!profile) {
    return (
      <UserDetailsState
        title="User not found"
        description="This user record is no longer available in your cloud workspace."
        backHref={backHref}
      />
    );
  }

  return <UserDetailsView profile={profile} backHref={backHref} />;
}
