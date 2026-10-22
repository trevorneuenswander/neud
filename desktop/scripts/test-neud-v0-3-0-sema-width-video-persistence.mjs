/**
 * Acceptance checks for SEMA full-width layout, video Loop defaults,
 * version badge hiding, project-video persistence, and icon playback controls.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), "utf8");
}

test("SEMA Data Source and Manual Controller use full content width", () => {
  const sheet = read("src/components/sema/SemaGoogleSheetClient.tsx");
  assert.doesNotMatch(sheet, /max-w-4xl/);
  assert.match(sheet, /flex w-full flex-col gap-6/);

  const controller = read("src/components/sema/SemaLocalControllerClient.tsx");
  assert.doesNotMatch(controller, /max-w-4xl/);
  assert.match(controller, /flex w-full flex-col gap-6/);
});

test("Broad Arrow Manual Controller layout is not constrained by SEMA width fix", () => {
  const ba = read("src/components/bag-graphics/BagControllerClient.tsx");
  assert.doesNotMatch(ba, /max-w-4xl/);
  assert.match(ba, /title="Manual Controller"/);
});

test("Add Display video form no longer exposes Loop; defaults OFF", () => {
  const form = read("src/components/developer-tools/UploadVideoDisplayForm.tsx");
  assert.doesNotMatch(form, /Loop playback|setLoopEnabled|checked=\{loopEnabled\}/);
  assert.match(form, /loopEnabled: false/);

  const create = read("desktop/src/services/developer-tools-service.ts");
  assert.match(create, /const loopEnabled = input\.loopEnabled === true/);
  assert.match(create, /this\.videoMedia\.setLoopEnabled\(asset\.id, loopEnabled\)/);

  const ipc = read("desktop/src/ipc/media.ts");
  assert.match(ipc, /loopEnabled: input\.loopEnabled === true/);

  const store = read("desktop/src/media/video-media-store.ts");
  assert.match(store, /, 1, 0, \?, \?\)/);
});

test("video version badge is hidden; HTML badge path preserved", () => {
  const card = read("src/components/displays/DeveloperHtmlDisplayCard.tsx");
  assert.match(card, /sourceType !== "project-video"/);
  assert.match(card, /DisplayVersionBadge/);
  assert.match(card, /ProRes 4444 Video Display/);
  assert.match(card, /Custom HTML Display/);
});

test("display sync pull preserves project-video identity", () => {
  const pull = read("desktop/src/services/display-sync/display-sync-pull.ts");
  assert.match(pull, /resolvePulledDisplaySourceType/);
  assert.match(pull, /Never downgrade an existing local project-video/);
  assert.doesNotMatch(
    pull,
    /sourceType: cloudDisplay\.display_type === "built-in" \? "built-in" : "project-html"/,
  );
});

test("listDisplays repairs coerced video source types and persists loop", () => {
  const tools = read("desktop/src/services/developer-tools-service.ts");
  assert.match(tools, /repairVideoDisplaySourceTypes/);
  assert.match(tools, /setVideoDisplayLoop/);
  assert.match(tools, /this\.repairVideoDisplaySourceTypes\(project\.id/);
});

test("portal display mapping keeps project-video displayType", () => {
  const local = read("desktop/src/services/local-data-service.ts");
  assert.match(local, /displayType: sourceType/);
  assert.match(local, /code\?\.sourceType === "project-video"/);
});

test("video playback controls are icon-only solid controls after Edit", () => {
  const controls = read("src/components/displays/VideoPlaybackControls.tsx");
  assert.match(controls, /from "lucide-react"/);
  assert.match(controls, /function PlayIcon/);
  assert.match(controls, /function PauseIcon/);
  assert.match(controls, /function StopIcon/);
  assert.match(controls, /RotateCcw/);
  assert.match(controls, /Repeat/);
  assert.match(controls, /fill="currentColor"/);
  assert.match(controls, /aria-label="Play"/);
  assert.match(controls, /title="Pause"/);
  assert.doesNotMatch(controls, />\s*Play\s*</);
  assert.doesNotMatch(controls, /Loop: \{/);

  const card = read("src/components/displays/DeveloperHtmlDisplayCard.tsx");
  assert.match(card, /DisplayEditMenu[\s\S]*VideoPlaybackControls/s);
  assert.match(card, /variant="card"/);
});

test("package.json includes lucide-react", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.ok(pkg.dependencies?.["lucide-react"]);
});
