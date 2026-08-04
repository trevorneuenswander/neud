"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DisclosureSection } from "@/components/ui/DisclosureSection";
import { formatPlatformRole } from "@/lib/portal/navigation";
import type { PlatformUserListItem } from "@/lib/users/types";

type HostedUsersDirectoryProps = {
  users: PlatformUserListItem[];
};

function formatProjectAccessLevel(accessLevel: string): string {
  const labels: Record<string, string> = {
    manager: "Operator",
    operator: "Operator",
    viewer: "Viewer",
  };
  return labels[accessLevel] ?? accessLevel.charAt(0).toUpperCase() + accessLevel.slice(1);
}

function formatTeamRole(platformRole: PlatformUserListItem["role"]): string {
  if (platformRole === "owner") {
    return "Owner";
  }
  if (platformRole === "admin") {
    return "Admin";
  }
  return "Member";
}

export function HostedUsersDirectory({ users }: HostedUsersDirectoryProps) {
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");

  const projectOptions = useMemo(() => {
    const bySlug = new Map<string, string>();
    for (const user of users) {
      for (const assignment of user.projectAssignments) {
        bySlug.set(assignment.projectSlug, assignment.projectName);
      }
    }
    return Array.from(bySlug.entries())
      .map(([slug, name]) => ({ slug, name }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [users]);

  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return users.filter((user) => {
      if (roleFilter !== "all" && user.role !== roleFilter) {
        return false;
      }
      if (
        projectFilter !== "all" &&
        !user.projectAssignments.some((assignment) => assignment.projectSlug === projectFilter)
      ) {
        return false;
      }
      if (!normalized) {
        return true;
      }
      const haystack = [
        user.fullName,
        user.email,
        user.team,
        user.role,
        formatPlatformRole(user.role),
        formatTeamRole(user.role),
        ...user.projectAssignments.flatMap((assignment) => [
          assignment.projectName,
          assignment.projectSlug,
          assignment.accessLevel,
          formatProjectAccessLevel(assignment.accessLevel),
        ]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [projectFilter, query, roleFilter, users]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="min-w-[16rem] flex-1">
          <label htmlFor="hosted-users-search" className="sr-only">
            Search users
          </label>
          <input
            id="hosted-users-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, email, team, project, or role"
            className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-foreground"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(event) => setRoleFilter(event.target.value)}
          className="rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-foreground"
          aria-label="Filter by platform role"
        >
          <option value="all">All platform roles</option>
          <option value="owner">Owner</option>
          <option value="admin">Admin</option>
          <option value="operator">Operator</option>
          <option value="viewer">Viewer</option>
        </select>
        <select
          value={projectFilter}
          onChange={(event) => setProjectFilter(event.target.value)}
          className="rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-foreground"
          aria-label="Filter by project"
        >
          <option value="all">All projects</option>
          {projectOptions.map((project) => (
            <option key={project.slug} value={project.slug}>
              {project.name}
            </option>
          ))}
        </select>
      </div>

      <Card className="overflow-hidden">
        {filteredUsers.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title={users.length === 0 ? "No users yet" : "No matching users"}
              description={
                users.length === 0
                  ? "Users with access to your NEUD workspace appear here."
                  : "Try a different search term or filter."
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filteredUsers.map((user) => (
              <li key={user.id} className="px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium text-foreground">
                      {user.fullName?.trim() || user.email}
                    </p>
                    {user.fullName?.trim() ? (
                      <p className="text-sm text-muted">{user.email}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={user.role} label={formatPlatformRole(user.role)} />
                    <span className="text-xs text-muted">
                      {user.assignedProjectCount ?? 0} project
                      {(user.assignedProjectCount ?? 0) === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>

                <DisclosureSection title="Permissions" className="mt-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <section className="space-y-2">
                      <h3 className="text-sm font-semibold text-foreground">Team permissions</h3>
                      <dl className="space-y-1 text-sm">
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted">Team</dt>
                          <dd className="text-foreground">{user.team?.trim() || "Unassigned"}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted">Platform role</dt>
                          <dd className="text-foreground">{formatPlatformRole(user.role)}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted">Team role</dt>
                          <dd className="text-foreground">{formatTeamRole(user.role)}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted">Account status</dt>
                          <dd className="text-foreground">{user.accountStatus}</dd>
                        </div>
                      </dl>
                    </section>

                    <section className="space-y-2">
                      <h3 className="text-sm font-semibold text-foreground">Project permissions</h3>
                      {user.projectAssignments.length === 0 ? (
                        <p className="text-sm text-muted">No project assignments.</p>
                      ) : (
                        <ul className="space-y-2">
                          {user.projectAssignments.map((assignment) => (
                            <li
                              key={`${user.id}-${assignment.projectId}`}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface-raised px-3 py-2 text-sm"
                            >
                              <Link
                                href={`/portal/projects/${assignment.projectSlug}/displays`}
                                className="font-medium text-foreground hover:underline"
                              >
                                {assignment.projectName}
                              </Link>
                              <span className="text-xs text-muted">
                                {formatProjectAccessLevel(assignment.accessLevel)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  </div>
                </DisclosureSection>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
