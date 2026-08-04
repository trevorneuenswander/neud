"use client";

import { Card } from "@/components/ui/Card";
import { isGenericWebpageSnapshot } from "@/lib/data-engines/generic-scraper-types";

type GenericPreviewProps = {
  data: Record<string, unknown> | null;
};

export function GenericPreview({ data }: GenericPreviewProps) {
  if (!data || !isGenericWebpageSnapshot(data)) {
    return null;
  }

  const snapshot = data;
  const entries = Object.entries(snapshot.values ?? {});

  return (
    <Card>
      <h3 className="text-sm font-semibold text-foreground">Extracted fields</h3>
      <p className="mt-1 text-sm text-muted">
        {snapshot.page.title ? `${snapshot.page.title} · ` : null}
        {snapshot.page.finalUrl}
      </p>
      {entries.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No fields were configured.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="py-2 pr-4 font-medium">Field</th>
                <th className="py-2 pr-4 font-medium">Found</th>
                <th className="py-2 font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(([key, field]) => (
                <tr key={key} className="border-b border-border/60 align-top">
                  <td className="py-2 pr-4 font-medium text-foreground">{key}</td>
                  <td className="py-2 pr-4 text-muted">{field.found ? "Yes" : "No"}</td>
                  <td className="py-2 text-foreground">
                    {field.error ? (
                      <span className="text-red-500">{field.error}</span>
                    ) : field.value ? (
                      <span className="break-all">{field.value}</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
