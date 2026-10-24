#!/usr/bin/env node
/**
 * Download the private Blackmagic DeckLink SDK ZIP from Google Drive using an OAuth Bearer token.
 * Never logs the token or archive contents.
 *
 * Env:
 *   GOOGLE_ACCESS_TOKEN or NEUD_GOOGLE_ACCESS_TOKEN — required
 *   NEUD_DECKLINK_DRIVE_FILE_ID — optional (default: configured NEUD file)
 *   NEUD_DECKLINK_SDK_ZIP — output path (required)
 */
import fs from "node:fs";
import path from "node:path";
import { DECKLINK_DRIVE_FILE_ID } from "./lib/decklink-sdk-tree.mjs";

const fileId = (process.env.NEUD_DECKLINK_DRIVE_FILE_ID || DECKLINK_DRIVE_FILE_ID).trim();
const token = (process.env.GOOGLE_ACCESS_TOKEN || process.env.NEUD_GOOGLE_ACCESS_TOKEN || "").trim();
const outPath = (process.env.NEUD_DECKLINK_SDK_ZIP || "").trim();

if (!token) {
  console.error("Missing GOOGLE_ACCESS_TOKEN (or NEUD_GOOGLE_ACCESS_TOKEN).");
  process.exit(1);
}
if (!outPath) {
  console.error("Missing NEUD_DECKLINK_SDK_ZIP output path.");
  process.exit(1);
}
if (!/^[a-zA-Z0-9_-]+$/.test(fileId)) {
  console.error("Invalid NEUD_DECKLINK_DRIVE_FILE_ID.");
  process.exit(1);
}

const mediaUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
const metaUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size`;

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, init, { attempts = 5, label = "request" } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, init);
      if (response.status === 429 || response.status >= 500) {
        const retryAfter = Number(response.headers.get("retry-after") || 0);
        const delay = retryAfter > 0 ? retryAfter * 1000 : Math.min(30_000, 500 * 2 ** (attempt - 1));
        console.error(`[drive] ${label} HTTP ${response.status}; retry ${attempt}/${attempts} in ${delay}ms`);
        await response.arrayBuffer().catch(() => undefined);
        await sleep(delay);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      const delay = Math.min(30_000, 500 * 2 ** (attempt - 1));
      console.error(`[drive] ${label} network error; retry ${attempt}/${attempts} in ${delay}ms`);
      await sleep(delay);
    }
  }
  throw lastError ?? new Error(`${label} failed after ${attempts} attempts`);
}

const authHeaders = { Authorization: `Bearer ${token}` };

console.log(`[drive] Validating DeckLink SDK file metadata (id configured, value not printed).`);
const metaResponse = await fetchWithRetry(
  metaUrl,
  { headers: authHeaders },
  { label: "metadata" },
);
if (!metaResponse.ok) {
  console.error(`[drive] Metadata request failed with HTTP ${metaResponse.status}`);
  process.exit(1);
}
const meta = await metaResponse.json();
if (meta.id !== fileId) {
  console.error("[drive] Metadata id mismatch — refusing download.");
  process.exit(1);
}
const name = typeof meta.name === "string" ? meta.name : "";
if (!/decklink/i.test(name) || !/sdk/i.test(name)) {
  console.error(`[drive] Unexpected Drive file name (refusing): ${name || "(empty)"}`);
  process.exit(1);
}
console.log(`[drive] Metadata OK: name=${name} size=${meta.size ?? "unknown"}`);

fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
const tmpPath = `${outPath}.partial`;
fs.rmSync(tmpPath, { force: true });
fs.rmSync(outPath, { force: true });

console.log("[drive] Downloading DeckLink SDK archive…");
const mediaResponse = await fetchWithRetry(
  mediaUrl,
  { headers: authHeaders },
  { label: "media" },
);
if (!mediaResponse.ok) {
  console.error(`[drive] Media download failed with HTTP ${mediaResponse.status}`);
  process.exit(1);
}

const fileHandle = fs.openSync(tmpPath, "w");
try {
  const reader = mediaResponse.body?.getReader?.();
  if (!reader) {
    const buffer = Buffer.from(await mediaResponse.arrayBuffer());
    fs.writeSync(fileHandle, buffer);
  } else {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fs.writeSync(fileHandle, Buffer.from(value));
    }
  }
} finally {
  fs.closeSync(fileHandle);
}

const stat = fs.statSync(tmpPath);
if (stat.size < 1_000_000) {
  fs.rmSync(tmpPath, { force: true });
  console.error(`[drive] Downloaded archive too small (${stat.size} bytes); refusing.`);
  process.exit(1);
}

fs.renameSync(tmpPath, outPath);
console.log(`[drive] Download complete (${stat.size} bytes) → ${outPath}`);
