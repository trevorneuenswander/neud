"use client";

import { Suspense, useMemo, useState } from "react";
import { AccessManagementTabs } from "@/components/access-management/AccessManagementTabs";
import { EMPTY_ACCESS_DIRECTORY } from "@/lib/access-management/actions";
import { createPortalAccessActions } from "@/lib/access-management/portal-actions";
import type { AccessManagementDirectory } from "@/lib/access-management/types";
import { createClient } from "@/lib/supabase/client";

type CloudAccessManagementClientProps = {
  initialDirectory: AccessManagementDirectory;
  currentUserId: string;
};

export function CloudAccessManagementClient({
  initialDirectory,
  currentUserId,
}: CloudAccessManagementClientProps) {
  const [directory, setDirectory] = useState(initialDirectory);

  const actions = useMemo(() => {
    const supabase = createClient();
    return createPortalAccessActions(supabase, setDirectory);
  }, []);

  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading access management…</p>}>
      <AccessManagementTabs
        directory={directory.ok ? directory : EMPTY_ACCESS_DIRECTORY}
        currentUserId={currentUserId}
        isOnline
        actions={actions}
      />
    </Suspense>
  );
}
