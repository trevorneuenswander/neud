"use client";

import { ActivityProjectLink } from "@/components/activity/ActivityProjectLink";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/portal/PageHeader";
import { PageSection } from "@/components/portal/PageSection";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/DataTable";
import type { UserDetailsProfile } from "@/lib/users/user-details-types";
import { getAccessManagementHref } from "@/lib/access-management/routes";

type UserDetailsViewProps = {
  profile: UserDetailsProfile;
  backHref?: string;
};

function formatContactValue(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "Not provided";
}

function formatTeamValue(teamName: string | null | undefined): string {
  const trimmed = teamName?.trim();
  return trimmed ? trimmed : "Not provided";
}

export function UserDetailsView({ profile, backHref = "/users?tab=users" }: UserDetailsViewProps) {
  const email = formatContactValue(profile.email);
  const phone = formatContactValue(profile.phone);
  const team = formatTeamValue(profile.teamName);

  return (
    <div className="space-y-8">
      <PageHeader
        title={profile.fullName}
        description={`${profile.roleLabel}${profile.isActive ? "" : " · Inactive"}`}
        action={
          <Button href={backHref} variant="secondary" size="sm">
            Back to Users
          </Button>
        }
      />

      <PageSection title="Profile Information">
        <Card className="space-y-4">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-muted">Full Name</dt>
              <dd className="mt-1 text-sm text-foreground">{profile.fullName}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted">Team</dt>
              <dd className="mt-1 text-sm text-foreground">{team}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted">Role</dt>
              <dd className="mt-1 text-sm text-foreground">{profile.roleLabel}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted">Email</dt>
              <dd className="mt-1 text-sm text-foreground">
                {email === "Not provided" ? (
                  email
                ) : (
                  <a href={`mailto:${email}`} className="hover:underline focus-visible:underline">
                    {email}
                  </a>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted">Phone Number</dt>
              <dd className="mt-1 text-sm text-foreground">
                {phone === "Not provided" ? (
                  phone
                ) : (
                  <a href={`tel:${phone}`} className="hover:underline focus-visible:underline">
                    {phone}
                  </a>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted">Account Sync</dt>
              <dd className="mt-1 text-sm text-foreground">
                {profile.supabaseUserId
                  ? profile.supabaseAccountAvailable
                    ? profile.lastSupabaseSyncAt
                      ? profile.source === "supabase"
                        ? "Account synchronized"
                        : "Using synchronized local cache"
                      : "Linked to Supabase"
                    : "Supabase account unavailable"
                  : "Not linked to Supabase"}
              </dd>
            </div>
          </dl>
          {profile.teams.length > 0 ? (
            <div className="border-t border-border pt-4">
              <p className="text-sm font-medium text-muted">Additional Team Memberships</p>
              <ul className="mt-2 space-y-2">
                {profile.teams.map((teamMembership) => (
                  <li
                    key={teamMembership.id}
                    className="flex flex-wrap items-center gap-2 text-sm text-foreground"
                  >
                    <span>{teamMembership.name}</span>
                    <StatusBadge status={teamMembership.role} />
                    {!teamMembership.isActive ? <StatusBadge status="rejected" /> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      </PageSection>

      <PageSection title="Associated Projects">
        {profile.projects.length === 0 ? (
          <EmptyState title="No associated projects" />
        ) : (
          <DataTable>
            <DataTableHead>
              <DataTableHeaderCell>Project Name</DataTableHeaderCell>
              <DataTableHeaderCell>Team Name</DataTableHeaderCell>
              <DataTableHeaderCell>Role</DataTableHeaderCell>
              <DataTableHeaderCell>Access Source</DataTableHeaderCell>
              <DataTableHeaderCell>Status</DataTableHeaderCell>
            </DataTableHead>
            <DataTableBody>
              {profile.projects.map((project) => (
                <DataTableRow key={project.id}>
                  <DataTableCell>
                    <ActivityProjectLink
                      projectSlug={project.slug}
                      projectName={project.name}
                      projectAvailable
                    />
                  </DataTableCell>
                  <DataTableCell className="text-muted">{project.teamName}</DataTableCell>
                  <DataTableCell>{project.role}</DataTableCell>
                  <DataTableCell>{project.accessSource}</DataTableCell>
                  <DataTableCell>
                    <StatusBadge status={project.isActive ? "approved" : "rejected"} />
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        )}
      </PageSection>
    </div>
  );
}

type UserDetailsStateProps = {
  title: string;
  description: string;
  variant?: "error" | "info";
  backHref?: string;
};

export function UserDetailsState({
  title,
  description,
  variant = "info",
  backHref = getAccessManagementHref("desktop", "users"),
}: UserDetailsStateProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="User Details"
        action={
          <Button href={backHref} variant="secondary" size="sm">
            Back to Users
          </Button>
        }
      />
      <Alert variant={variant === "error" ? "error" : "info"}>
        <p className="font-medium text-foreground">{title}</p>
        <p className="mt-1 text-sm">{description}</p>
      </Alert>
    </div>
  );
}

export function UserDetailsLoadingState() {
  return (
    <div className="space-y-6">
      <PageHeader title="User Details" description="Loading user profile…" />
      <Card className="animate-pulse space-y-3">
        <div className="h-4 w-40 rounded bg-surface-raised" />
        <div className="h-4 w-64 rounded bg-surface-raised" />
        <div className="h-4 w-52 rounded bg-surface-raised" />
      </Card>
    </div>
  );
}
