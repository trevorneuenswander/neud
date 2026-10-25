/**
 * Shared Output-card helpers for Record to Disk live statistics.
 * Duration is derived from an authoritative start timestamp.
 * Byte size never fabricates MF-buffered disk usage.
 */

export function elapsedRecordingSeconds(
  startedAt: string | null | undefined,
  nowMs: number = Date.now(),
): number {
  if (!startedAt) return 0;
  const startedMs = Date.parse(startedAt);
  if (!Number.isFinite(startedMs)) return 0;
  return Math.max(0, (nowMs - startedMs) / 1000);
}

export function formatRecordingByteSize(byteSize: number): string {
  const bytes = Math.max(0, Math.floor(byteSize));
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    const mb = bytes / (1024 * 1024);
    return `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`;
  }
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb >= 10 ? Math.round(gb) : Math.round(gb * 10) / 10} GB`;
}

export function formatRecordingLiveStats(input: {
  startedAt: string | null | undefined;
  durationSeconds?: number | null;
  byteSize?: number | null;
  diskBytesPending?: boolean | null;
  encodedFrames?: number | null;
  droppedFrames?: number | null;
  nowMs?: number;
}): string {
  const duration = Math.floor(
    input.startedAt
      ? elapsedRecordingSeconds(input.startedAt, input.nowMs)
      : Math.max(0, input.durationSeconds ?? 0),
  );
  const bytes = Math.max(0, Math.floor(input.byteSize ?? 0));
  const pending =
    input.diskBytesPending === true || (bytes === 0 && (input.encodedFrames ?? 0) > 0);
  const sizeLabel = bytes > 0
    ? formatRecordingByteSize(bytes)
    : pending
      ? "disk buffered"
      : "0 B";
  const dropped = Math.max(0, Math.floor(input.droppedFrames ?? 0));
  const frames = Math.max(0, Math.floor(input.encodedFrames ?? 0));
  const framePart = frames > 0 ? ` · ${frames} frames` : "";
  return `${duration}s · ${sizeLabel}${framePart} · dropped ${dropped}`;
}
