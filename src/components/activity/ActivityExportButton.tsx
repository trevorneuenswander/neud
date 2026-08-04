"use client";

import { Button } from "@/components/ui/Button";
import {
  buildActivityCsvFilename,
  downloadActivityCsv,
  type ActivityCsvRow,
} from "@/lib/activity/csv-export";

type ActivityExportButtonProps = {
  rows: ActivityCsvRow[];
  scope: "global" | "project";
  projectSlug?: string;
  disabled?: boolean;
};

export function ActivityExportButton({
  rows,
  scope,
  projectSlug,
  disabled = false,
}: ActivityExportButtonProps) {
  function handleDownload() {
    if (rows.length === 0) {
      return;
    }
    downloadActivityCsv(rows, buildActivityCsvFilename(scope, projectSlug));
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      disabled={disabled || rows.length === 0}
      onClick={handleDownload}
    >
      Download CSV
    </Button>
  );
}
