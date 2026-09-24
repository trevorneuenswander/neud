import {
  buildRuntimeDiagnosticsFromCache,
  isBagEventDrivenLiveEnabled,
  stripInternalLiveMetaForSnapshot,
} from "./bag-live-feed-utils.js";

export function bagAdapterSupportsEventDrivenLive(bundle) {
  return (
    isBagEventDrivenLiveEnabled() &&
    bundle?.engine?.config?.adapter === "bag-auction"
  );
}

export async function publishBagLiveSnapshot({
  engineId,
  workerId,
  data,
  meta,
  writeSnapshot,
  recordRunSuccess,
  writeLog,
}) {
  const publicData = stripInternalLiveMetaForSnapshot(data);
  const payload = JSON.stringify(publicData);
  const recordCount = Array.isArray(publicData.lots) ? publicData.lots.length : null;
  const durationMs = meta?.durationMs ?? 0;
  const runtimeDiagnostics = buildRuntimeDiagnosticsFromCache(data, meta?.liveFeed ?? null);

  await writeSnapshot(engineId, publicData, {
    recordCount,
    durationMs,
    workerId,
    payloadSizeBytes: Buffer.byteLength(payload, "utf8"),
    liveFeedRuntime: meta?.liveFeed ?? null,
  });

  await recordRunSuccess(engineId, {
    actualState: "running",
    startedAt: new Date().toISOString(),
    durationMs,
    recordCount,
    payloadSizeBytes: Buffer.byteLength(payload, "utf8"),
  }).catch(() => {});

  await writeLog(engineId, "info", "scrape.live_update", "Live canonical snapshot updated", {
    ...runtimeDiagnostics,
    runType: meta?.runType ?? "live_event",
    completedAt: new Date().toISOString(),
  }).catch(() => {});

  if (meta?.executionLog) {
    await writeLog(engineId, "info", "engine.execution", meta.executionLog, {
      liveFeed: meta.liveFeed ?? null,
    }).catch(() => {});
  }
}
