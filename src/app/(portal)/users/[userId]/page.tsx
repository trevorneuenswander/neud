import { UserDetailsClient } from "@/components/users/UserDetailsClient";
import { UserDetailsState } from "@/components/users/UserDetailsView";
import { resolveSafeUsersReturnHref } from "@/lib/access-management/routes";
import { shouldUseLocalData } from "@/lib/local/mode";

type UserDetailsPageProps = {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ returnTo?: string }>;
};

export default async function UserDetailsPage({
  params,
  searchParams,
}: UserDetailsPageProps) {
  const { userId } = await params;
  const { returnTo } = await searchParams;
  const backHref = resolveSafeUsersReturnHref(returnTo, "desktop");

  if (!userId?.trim()) {
    return (
      <UserDetailsState
        title="User not found"
        description="A valid user identifier is required."
        backHref={backHref}
      />
    );
  }

  if (!shouldUseLocalData()) {
    return (
      <UserDetailsState
        title="User details unavailable"
        description="User details are available in the NEUD desktop application."
        backHref={backHref}
      />
    );
  }

  return <UserDetailsClient userId={userId} backHref={backHref} />;
}
