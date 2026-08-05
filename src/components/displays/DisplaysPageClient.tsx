"use client";

import { useEffect, useRef, useState } from "react";
import { AddHtmlDisplayButton } from "@/components/developer-tools/AddHtmlDisplayButton";
import { DisplaysListClient } from "@/components/displays/DisplaysListClient";
import { PageHeader } from "@/components/portal/PageHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  buildCustomDisplayListItem,
  type DisplayListItem,
} from "@/lib/displays/displays-list-types";
import type { CreatedDisplayPayload } from "@/lib/local/displays-api";
import { localFetch } from "@/lib/local/api";

type DisplaysPageClientProps = {
  projectSlug: string;
  projectId: string;
  initialItems: DisplayListItem[];
  archivedCount: number;
  hasLiveSnapshot: boolean;
  canManageSettings: boolean;
  canReorder: boolean;
};

export function DisplaysPageClient({
  projectSlug,
  projectId,
  initialItems,
  archivedCount,
  hasLiveSnapshot,
  canManageSettings,
  canReorder,
}: DisplaysPageClientProps) {
  const [items, setItems] = useState(initialItems);
  const dragActiveRef = useRef(false);

  useEffect(() => {
    if (dragActiveRef.current) {
      return;
    }
    setItems(initialItems);
  }, [initialItems]);

  useEffect(() => {
    void localFetch("/api/display-sync/sync-now", { method: "POST" }).catch(() => {
      // sync is best-effort when opening Displays
    });
  }, [projectSlug]);

  function handleDragActiveChange(active: boolean) {
    dragActiveRef.current = active;
  }

  function handleDisplayCreated(display: CreatedDisplayPayload) {
    setItems((current) => [...current, buildCustomDisplayListItem(display)]);
  }

  const archivedLabel =
    archivedCount > 0 ? `Archived Displays (${archivedCount})` : "Archived Displays";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Displays"
          description="Local display URLs for this project's on-air graphics."
        />
        {canManageSettings ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              href={`/projects/${projectSlug}/displays/archived`}
              size="sm"
              variant="secondary"
            >
              {archivedLabel}
            </Button>
            <AddHtmlDisplayButton
              projectSlug={projectSlug}
              onCreated={handleDisplayCreated}
            />
          </div>
        ) : null}
      </div>
      {items.length === 0 ? (
        <EmptyState
          title="No displays have been added."
          description="Upload an HTML display to create the first graphic for this project."
        />
      ) : (
        <DisplaysListClient
          projectSlug={projectSlug}
          projectId={projectId}
          items={items}
          onItemsChange={setItems}
          hasLiveSnapshot={hasLiveSnapshot}
          canReorder={canReorder}
          canDeveloperTools={canManageSettings}
          onDragActiveChange={handleDragActiveChange}
        />
      )}
    </div>
  );
}
