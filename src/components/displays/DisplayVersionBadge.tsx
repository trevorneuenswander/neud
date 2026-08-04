import {
  formatDisplayVersion,
  DISPLAY_VERSION_UNAVAILABLE_LABEL,
} from "@/lib/displays/display-version-format";
import { formatActiveRevisionLabel } from "@/lib/developer-tools/revision-labels";

type DisplayVersionBadgeProps = {
  versionNumber: number | null;
  createdAt?: string | null;
};

export function DisplayVersionBadge({
  versionNumber,
  createdAt = null,
}: DisplayVersionBadgeProps) {
  if (versionNumber === null) {
    return (
      <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
        {DISPLAY_VERSION_UNAVAILABLE_LABEL}
      </span>
    );
  }

  const label = formatDisplayVersion(versionNumber);
  const accessibleLabel =
    createdAt != null
      ? formatActiveRevisionLabel(versionNumber, createdAt)
      : label;

  return (
    <span
      className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted"
      title={accessibleLabel}
      aria-label={accessibleLabel}
    >
      {label}
    </span>
  );
}
