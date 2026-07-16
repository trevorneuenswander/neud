import { LogoutButton } from "@/components/auth/LogoutButton";
import { formatPlatformRole } from "@/lib/portal/navigation";
import type { Profile } from "@/types/database";

type SidebarUserPanelProps = {
  profile: Profile;
};

export function SidebarUserPanel({ profile }: SidebarUserPanelProps) {
  return (
    <div className="space-y-3">
      <div className="min-w-0">
        {profile.full_name ? (
          <p className="truncate text-sm font-medium text-foreground">
            {profile.full_name}
          </p>
        ) : null}
        {profile.company ? (
          <p className="truncate text-xs text-muted">{profile.company}</p>
        ) : null}
        <p className="mt-1 text-xs text-muted">
          {formatPlatformRole(profile.role)}
        </p>
      </div>
      <LogoutButton />
    </div>
  );
}
