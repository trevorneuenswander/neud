import { DISPLAY_METADATA_BADGE_BOX_CLASS } from "@/components/displays/display-metadata-badge-classes";
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
      <span
        className={`${DISPLAY_METADATA_BADGE_BOX_CLASS} uppercase tracking-wide text-muted border-border`}
      >
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
      className={`${DISPLAY_METADATA_BADGE_BOX_CLASS} border-border text-muted`}
      title={accessibleLabel}
      aria-label={accessibleLabel}
    >
      {label}
    </span>
  );
}
