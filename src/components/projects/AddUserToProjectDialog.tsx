"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import {
  localAssignCloudProjectMember,
  localGetCloudAccessDirectory,
} from "@/lib/local/cloud-access-api";
import type { CloudProjectRole } from "@/lib/access-management/types";
import { shouldUseLocalData } from "@/lib/local/mode";
import {
  localAssignAccessProject,
  localGetAccessDirectory,
  type AccessDirectoryUser,
} from "@/lib/local/access-api";
import type { ProjectAccessRole } from "@/lib/access/types";

type AddUserToProjectDialogProps = {
  projectId: string;
  projectName: string;
  existingUserIds: string[];
  onClose: () => void;
  onAdded: () => void;
};

type DialogUser = {
  id: string;
  fullName: string;
  email: string;
};

export function AddUserToProjectDialog({
  projectId,
  projectName,
  existingUserIds,
  onClose,
  onAdded,
}: AddUserToProjectDialogProps) {
  const localMode = shouldUseLocalData();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<DialogUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [accessRole, setAccessRole] = useState<CloudProjectRole>("viewer");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        if (localMode) {
          const directory = await localGetCloudAccessDirectory();
          if (cancelled) return;
          setUsers(
            directory.users.map((user) => ({
              id: user.id,
              fullName: user.fullName,
              email: user.email,
            })),
          );
          return;
        }

        const directory = await localGetAccessDirectory();
        if (cancelled) return;
        setUsers(
          directory.users
            .filter((user: AccessDirectoryUser) => user.isActive)
            .map((user) => ({
              id: user.id,
              fullName: user.fullName,
              email: user.email,
            })),
        );
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load users for assignment.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [localMode]);

  const existingIds = useMemo(() => new Set(existingUserIds), [existingUserIds]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter((user) => {
      if (existingIds.has(user.id)) return false;
      if (!query) return true;
      return (
        user.fullName.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query)
      );
    });
  }, [existingIds, search, users]);

  async function handleSubmit() {
    if (!selectedUserId) {
      setError("Select a user before adding access.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (localMode) {
        await localAssignCloudProjectMember({
          projectId,
          userId: selectedUserId,
          role: accessRole,
        });
      } else {
        await localAssignAccessProject({
          projectId,
          teamId: "",
          userId: selectedUserId,
          accessRole: accessRole as ProjectAccessRole,
        });
      }
      onAdded();
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to grant project access.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-surface p-4 shadow-xl">
        <h3 className="text-base font-semibold text-foreground">Add User to Project</h3>
        <p className="mt-1 text-sm text-muted">
          Grant an existing user direct access to {projectName}.
        </p>

        <div className="mt-4 space-y-3">
          <label className="grid gap-1 text-sm">
            <span className="text-muted">Search users</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-10 rounded-md border border-border bg-surface-raised px-3 text-sm text-foreground"
              placeholder="Name or email"
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-muted">User</span>
            <select
              value={selectedUserId}
              onChange={(event) => setSelectedUserId(event.target.value)}
              className="h-10 rounded-md border border-border bg-surface-raised px-3 text-sm text-foreground"
              disabled={loading || filteredUsers.length === 0}
            >
              <option value="">
                {loading
                  ? "Loading users…"
                  : filteredUsers.length === 0
                    ? "No eligible users found"
                    : "Select a user"}
              </option>
              {filteredUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.fullName} ({user.email})
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-muted">Project Role</span>
            <select
              value={accessRole}
              onChange={(event) => setAccessRole(event.target.value as CloudProjectRole)}
              className="h-10 rounded-md border border-border bg-surface-raised px-3 text-sm text-foreground"
            >
              <option value="manager">Manager</option>
              <option value="operator">Operator</option>
              <option value="viewer">Viewer</option>
            </select>
          </label>
        </div>

        {error ? (
          <div className="mt-4">
            <Alert variant="error">{error}</Alert>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button type="button" size="sm" variant="secondary" disabled={submitting} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={submitting || !selectedUserId}
            onClick={() => void handleSubmit()}
          >
            Add User
          </Button>
        </div>
      </div>
    </div>
  );
}
