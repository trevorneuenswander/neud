import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/authorization";
import { localGetProjectsMeta } from "@/lib/local/displays-api";
import { shouldUseLocalData } from "@/lib/local/mode";

export default async function ProfilePage() {
  if (shouldUseLocalData()) {
    const meta = await localGetProjectsMeta({ wait: false });
    if (meta.authenticatedLocalUserId) {
      redirect(`/users/${encodeURIComponent(meta.authenticatedLocalUserId)}`);
    }
    redirect("/users");
  }

  const profile = await getCurrentProfile();
  if (profile) {
    redirect(`/users/${encodeURIComponent(profile.id)}`);
  }

  redirect("/dashboard");
}
