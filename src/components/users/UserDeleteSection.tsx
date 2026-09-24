"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PageSection } from "@/components/portal/PageSection";
import { localDeletePlatformUser } from "@/lib/local/access-api";
import { isLocalApiError } from "@/lib/local/errors";

type UserDeleteSectionProps = {
  userId: string;
  fullName: string;
  backHref: string;
};

export function UserDeleteSection({
  userId,
  fullName,
  backHref,
}: UserDeleteSectionProps) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setError(null);
    try {
      const result = await localDeletePlatformUser(userId);
      if (!result.ok) {
        setError("User deletion failed.");
        return;
      }
      setConfirmOpen(false);
      router.push(backHref);
      router.refresh();
    } catch (deleteError) {
      if (isLocalApiError(deleteError)) {
        setError(deleteError.message);
        return;
      }
      setError(
        deleteError instanceof Error ? deleteError.message : "User deletion failed.",
      );
    }
  }

  return (
    <PageSection title="User Management">
      <Card className="space-y-4 border-destructive/30">
        <div>
          <p className="text-sm font-medium text-foreground">Delete User</p>
          <p className="mt-1 text-sm text-muted">
            Permanently remove this account, memberships, and access. Historical activity
            records will remain.
          </p>
        </div>
        {error ? <Alert variant="error">{error}</Alert> : null}
        <Button type="button" variant="danger" size="sm" onClick={() => setConfirmOpen(true)}>
          Delete User
        </Button>
      </Card>
      {confirmOpen ? (
        <ConfirmDialog
          title={`Delete ${fullName}?`}
          description={
            "This will permanently remove this user's account and access.\nTheir historical activity records will remain.\n\nThis action cannot be undone."
          }
          confirmLabel="Delete User"
          confirmVariant="destructive"
          busyLabel="Deleting…"
          onCancel={() => setConfirmOpen(false)}
          onConfirm={handleDelete}
        />
      ) : null}
    </PageSection>
  );
}
