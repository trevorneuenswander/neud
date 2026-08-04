import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import type { BagSnapshotData } from "@/lib/data-engines/types";

type BagPreviewProps = {
  data: BagSnapshotData | null;
};

function safeImageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") return null;
    return value;
  } catch {
    return null;
  }
}

export function BagPreview({ data }: BagPreviewProps) {
  if (!data) {
    return (
      <EmptyState
        title="No BAG preview yet"
        description="The BAG preview appears after the first successful scrape."
      />
    );
  }

  const display = data.auctionDisplay as Record<string, unknown> | null | undefined;
  const current = data.current as Record<string, unknown> | null | undefined;
  const photos = Array.isArray(display?.photos) ? display.photos : [];
  const imageUrl = safeImageUrl(photos[0]);

  return (
    <Card>
      <h3 className="text-sm font-semibold text-foreground">Current data preview</h3>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted">Current lot</dt>
          <dd className="text-foreground">{String(current?.lot ?? display?.lot ?? "—")}</dd>
        </div>
        <div>
          <dt className="text-muted">Year</dt>
          <dd className="text-foreground">{String(display?.year ?? "—")}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-muted">Vehicle title</dt>
          <dd className="text-foreground">{String(current?.title ?? display?.title ?? "—")}</dd>
        </div>
        <div>
          <dt className="text-muted">Current bid</dt>
          <dd className="text-foreground">
            {String(current?.price ?? display?.biddingPrice ?? "—")}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Reserve status</dt>
          <dd className="text-foreground">{String(display?.reserveStatus ?? "—")}</dd>
        </div>
        <div>
          <dt className="text-muted">Previous lot</dt>
          <dd className="text-foreground">{String(data.prev?.lot ?? "—")}</dd>
        </div>
        <div>
          <dt className="text-muted">Next lots</dt>
          <dd className="text-foreground">
            {Array.isArray(data.next)
              ? data.next.map((item) => String(item.lot ?? "—")).join(", ") || "—"
              : "—"}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-muted">Last sold</dt>
          <dd className="text-foreground">
            {data.lastSold
              ? `${String(data.lastSold.lot ?? "—")} · ${String(data.lastSold.price ?? "—")}`
              : "—"}
          </dd>
        </div>
      </dl>

      {imageUrl ? (
        <div className="mt-4">
          <p className="text-xs text-muted">Primary image</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Primary auction display"
            className="mt-2 max-h-40 rounded-md border border-border object-cover"
          />
        </div>
      ) : null}
    </Card>
  );
}
