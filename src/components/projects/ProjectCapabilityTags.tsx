"use client";

import {
  getCapabilityLabel,
  MAX_CAPABILITY_TAGS_VISIBLE,
  normalizeCapabilityIds,
} from "@/lib/projects/capabilities";

type ProjectCapabilityTagsProps = {
  capabilities?: string[] | null;
  maxVisible?: number;
  className?: string;
};

export function ProjectCapabilityTags({
  capabilities,
  maxVisible = MAX_CAPABILITY_TAGS_VISIBLE,
  className = "",
}: ProjectCapabilityTagsProps) {
  const ids = normalizeCapabilityIds(capabilities);
  if (ids.length === 0) {
    return <span className="text-sm text-muted">—</span>;
  }

  const visible = ids.slice(0, maxVisible);
  const overflow = ids.length - visible.length;
  const fullLabel = ids.map((id) => getCapabilityLabel(id)).join(", ");

  return (
    <div
      className={`flex flex-wrap items-center gap-1.5 ${className}`}
      title={fullLabel}
    >
      {visible.map((id) => (
        <span
          key={id}
          className="inline-flex max-w-full items-center rounded border border-border bg-surface-raised px-1.5 py-0.5 text-left text-xs text-foreground"
        >
          <span className="truncate">{getCapabilityLabel(id)}</span>
        </span>
      ))}
      {overflow > 0 ? (
        <span
          className="inline-flex items-center rounded border border-border px-1.5 py-0.5 text-xs text-muted"
          title={ids
            .slice(maxVisible)
            .map((id) => getCapabilityLabel(id))
            .join(", ")}
        >
          +{overflow} more
        </span>
      ) : null}
    </div>
  );
}
