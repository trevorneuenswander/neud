"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField } from "@/components/ui/FormField";
import { DataTableCell, DataTableRow } from "@/components/ui/DataTable";
import { AccessManagementTable } from "@/components/access-management/AccessManagementTable";
import { USER_COLUMN_WIDTHS } from "@/lib/access-management/table-layout";
import type { AccessManagementDirectory } from "@/lib/access-management/types";
import {
  countDirectProjectAccess,
  formatUserTeamLabel,
  listActiveTeamNamesForUser,
  matchesUserDirectorySearch,
  resolveUserAccessScope,
  summarizeTeamRolesForUser,
} from "@/lib/access-management/role-model";
import { AccessUserDeleteButton } from "@/components/access-management/AccessUserDeleteButton";
import { getAccessManagementUserDetailsHref } from "@/lib/access-management/routes";
import { useAccessManagementSurface } from "@/lib/access-management/use-access-management-tab-state";

type UsersPanelProps = {
  directory: Pick<
    AccessManagementDirectory,
    "users" | "teamMemberships" | "projectMembers" | "teams" | "projects" | "projectTeams"
  >;
  showUserDetailsLinks?: boolean;
  currentUserId?: string | null;
  isOnline?: boolean;
  onDirectoryRefresh?: () => Promise<unknown>;
};

export function UsersPanel({
  directory,
  showUserDetailsLinks = false,
  currentUserId = null,
  isOnline = true,
  onDirectoryRefresh,
}: UsersPanelProps) {
  const [query, setQuery] = useState("");
  const surface = useAccessManagementSurface();

  const filtered = useMemo(() => {
    return directory.users.filter((user) => matchesUserDirectorySearch(user, directory, query));
  }, [directory, query]);

  return (
    <div className="space-y-4">
      <FormField
        id="users-search"
        name="users-search"
        label="Search users"
        placeholder="Name, email, team, team role, or project access"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        required={false}
      />

      {filtered.length === 0 ? (
        <EmptyState title="No users found" description="Try a different search term." />
      ) : (
        <AccessManagementTable
          columnWidths={USER_COLUMN_WIDTHS}
          headers={[
            "User",
            "Teams",
            "Team Role(s)",
            "Project Access",
            "Scope",
            "Status",
            "Actions",
          ]}
        >
          {filtered.map((user) => {
            const teamsLabel = formatUserTeamLabel(user.id, directory);
            const teamRoles = summarizeTeamRolesForUser(user.id, directory);
            const projectAccessCount = countDirectProjectAccess(user.id, directory);
            const scope = resolveUserAccessScope(user.id, directory);
            const primaryTeams = listActiveTeamNamesForUser(user.id, directory);
            const displayName = user.fullName?.trim() || "—";
            const detailsHref = showUserDetailsLinks
              ? getAccessManagementUserDetailsHref(user.id, surface, {
                  returnTab: "users",
                })
              : null;

            return (
              <DataTableRow key={user.id}>
                <DataTableCell>
                  {detailsHref ? (
                    <Link
                      href={detailsHref}
                      className="block truncate font-medium text-foreground hover:underline focus-visible:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                      aria-label={`View ${displayName} user details`}
                    >
                      {displayName}
                    </Link>
                  ) : (
                    <div className="truncate font-medium">{displayName}</div>
                  )}
                  <div className="truncate text-sm text-muted">{user.email || "—"}</div>
                </DataTableCell>
                <DataTableCell className="whitespace-normal text-sm">
                  {primaryTeams.length > 0 ? primaryTeams.join(", ") : teamsLabel}
                </DataTableCell>
                <DataTableCell className="whitespace-normal text-sm">{teamRoles}</DataTableCell>
                <DataTableCell className="tabular-nums">
                  {projectAccessCount > 0 ? projectAccessCount : "—"}
                </DataTableCell>
                <DataTableCell className="whitespace-normal text-sm">{scope}</DataTableCell>
                <DataTableCell>{user.accountStatus}</DataTableCell>
                <DataTableCell>
                  {currentUserId && onDirectoryRefresh ? (
                    <AccessUserDeleteButton
                      actorUserId={currentUserId}
                      targetUserId={user.id}
                      targetFullName={displayName}
                      directory={directory}
                      disabled={!isOnline}
                      onDeleted={async () => {
                        await onDirectoryRefresh();
                      }}
                    />
                  ) : (
                    "—"
                  )}
                </DataTableCell>
              </DataTableRow>
            );
          })}
        </AccessManagementTable>
      )}
    </div>
  );
}
