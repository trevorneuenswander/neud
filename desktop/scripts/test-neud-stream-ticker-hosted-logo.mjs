#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const hostedLogoPath = pathToFileURL(
  path.join(repoRoot, "shared/display-runtime/stream-ticker-hosted-logo.ts"),
).href;

const {
  inlineStreamTickerLogoForHosted,
  isStreamTickerLogoReference,
  resolveStreamTickerLogoFailureStage,
  STREAM_TICKER_LOGO_ASSET_PATH,
} = await import(hostedLogoPath);

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("local stream ticker HTML keeps filesystem logo reference", () => {
  const html = read("desktop/src/displays/bundled/stream-ticker-v1.html");
  assert.match(html, new RegExp(`src="${STREAM_TICKER_LOGO_ASSET_PATH.replace(/\//g, "\\/")}"`));
  assert.doesNotMatch(html, /data:image\/png;base64,/);
});

test("hosted prepare inlines logo as data URI without file or localhost references", () => {
  const html = read("desktop/src/displays/bundled/stream-ticker-v1.html");
  const hosted = inlineStreamTickerLogoForHosted(html);
  assert.doesNotMatch(hosted, /src="\/displays\/pylon\/logo\.png"/);
  assert.match(hosted, /src="data:image\/png;base64,/);
  assert.doesNotMatch(hosted, /file:\/\//);
  assert.doesNotMatch(hosted, /localhost/);
  assert.doesNotMatch(hosted, /127\.0\.0\.1/);
  assert.doesNotMatch(hosted, /\/api\/offline-assets\//);
  const displayDocument = read("src/lib/developer-tools/display-document.ts");
  assert.match(displayDocument, /inlineStreamTickerLogoForHosted/);
});

test("display sync inlines logo before cloud upload for stream-ticker", () => {
  const service = read("desktop/src/services/display-sync/display-sync-service.ts");
  assert.match(service, /inlineStreamTickerLogoForHosted/);
  assert.match(service, /slug === "stream-ticker"/);
});

test("failure stage resolves relative path without base in unpublished hosted HTML", () => {
  const html = read("desktop/src/displays/bundled/stream-ticker-v1.html");
  assert.equal(
    resolveStreamTickerLogoFailureStage({
      htmlPresent: true,
      logoReferencePresent: isStreamTickerLogoReference(html),
      logoInlined: false,
      logoDataUriPresent: true,
    }),
    "relative_url_without_base",
  );
});

test("failure stage is none after inlining", () => {
  const html = read("desktop/src/displays/bundled/stream-ticker-v1.html");
  const inlined = inlineStreamTickerLogoForHosted(html);
  assert.equal(
    resolveStreamTickerLogoFailureStage({
      htmlPresent: true,
      logoReferencePresent: isStreamTickerLogoReference(html),
      logoInlined: !isStreamTickerLogoReference(inlined),
      logoDataUriPresent: true,
    }),
    "none",
  );
});

test("generated logo data URI module exists for desktop build", () => {
  const sharedGenerated = read("shared/display-runtime/stream-ticker-logo-data-uri.generated.ts");
  assert.match(sharedGenerated, /STREAM_TICKER_LOGO_DATA_URI/);
  assert.match(sharedGenerated, /data:image\/png;base64,/);
});

test("diagnose broad arrow online reports stream ticker logo fields", () => {
  const diagnose = read("scripts/live-validation/diagnose-broad-arrow-online.mjs");
  assert.match(diagnose, /logoAssetReferenceType/);
  assert.match(diagnose, /firstLogoFailureStage/);
  assert.match(diagnose, /logoRendered/);
});
