import { UserDetailsState, UserDetailsView } from "@/components/users/UserDetailsView";
import { canViewUserDetails } from "@/lib/access-management/can-view-user-details";
import { buildCloudUserDetailsProfile } from "@/lib/access-management/user-details";
import { resolveSafeUsersReturnHref } from "@/lib/access-management/routes";
import { fetchAccessManagementDirectory } from "@/lib/access-management/directory-client";
import { requireUser } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";

type HostedUserDetailsPageProps = {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ returnTo?: string }>;
};

export default async function HostedUserDetailsPage({
  params,
  searchParams,
}: HostedUserDetailsPageProps) {
  const { claims } = await requireUser();
  const actorUserId = claims.sub?.trim() ?? "";
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
  let directory = null;

  try {
    directory = await fetchAccessManagementDirectory(supabase);
  } catch {
    directory = null;
  }

  if (!directory) {
    return (
      <UserDetailsState
        title="Unable to load user details"
        description="Cloud access data could not be loaded. Try again."
        backHref={backHref}
      />
    );
  }

  const targetPresent = directory.users.some((entry) => entry.id === userId);
  if (!targetPresent) {
    return (
      <UserDetailsState
        title="User not found"
        description="This user record is no longer available in your cloud workspace."
        backHref={backHref}
      />
    );
  }

  if (!canViewUserDetails(actorUserId, userId, directory)) {
    return (
      <UserDetailsState
        title="Permission denied"
        description="You do not have permission to view this user's details."
        variant="error"
        backHref={backHref}
      />
    );
  }

  const profile = buildCloudUserDetailsProfile(userId, directory);
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
