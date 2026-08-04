import { Card } from "@/components/ui/Card";
import {
  BAG_EXTRACTION_MANIFEST_GROUPS,
} from "@/lib/data-engines/bag-extraction-definitions";
import type { WebpageScraperSource } from "@/lib/data-engines/types";

type BagExtractionPanelProps = {
  sources?: WebpageScraperSource[];
};

function isSourceEnabled(
  sources: WebpageScraperSource[] | undefined,
  sourceKey: string,
): boolean {
  if (!sources?.length) return true;
  const source = sources.find((row) => row.source_key === sourceKey);
  return source ? source.enabled : true;
}

export function BagExtractionPanel({ sources }: BagExtractionPanelProps) {
  return (
    <Card>
      <p className="text-sm text-muted">
        Fixed BAG Auction adapter fields grouped by source. Selector edits remain
        read-only until runtime consumes stored selector definitions.
      </p>
      <div className="mt-4 space-y-6">
        {BAG_EXTRACTION_MANIFEST_GROUPS.map((group) => {
          const sourceKey = group.entries[0]?.sourceKey ?? "";
          const unavailable =
            sourceKey &&
            sourceKey !== "derived" &&
            !isSourceEnabled(sources, sourceKey);

          return (
            <div
              key={group.id}
              className={`space-y-3 ${unavailable ? "opacity-60" : ""}`}
            >
              <div>
                <h4 className="text-sm font-medium text-foreground">{group.title}</h4>
                <p className="text-xs text-muted">
                  Source: {group.sourceLabel}
                  {group.description ? ` — ${group.description}` : ""}
                </p>
                {unavailable ? (
                  <p className="mt-1 text-xs text-muted">
                    Source disabled — extractions unavailable until re-enabled.
                  </p>
                ) : null}
              </div>
              <ul className="space-y-2">
                {group.entries.map((definition) => (
                  <li
                    key={definition.key}
                    className="rounded-md border border-border p-3 space-y-1"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {definition.label}
                        </p>
                        <p className="text-xs text-muted">Key: {definition.key}</p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                          {definition.extractionType}
                        </span>
                        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                          {definition.editable ? "Editable" : "Fixed"}
                        </span>
                        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                          {definition.enabled ? "Enabled" : "Disabled"}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-muted">{definition.description}</p>
                    <p className="font-mono text-xs text-foreground break-all">
                      {definition.selectorOrStrategy}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
