import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildAuctionExportFileName,
  resolveAuctionJsonPathInPackage,
  resolveUniqueAuctionExportPath,
} from "../dist/services/auction-data-paths.js";
import { createAuctionExportProgress } from "../dist/services/auction-export-progress.js";
import { normalizeLotThumbnailPhotos } from "../dist/services/lot-thumbnail-service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("auction export progress never decreases and reaches 100 on complete", () => {
  const exportId = "test-export";
  const steps = [
    createAuctionExportProgress(exportId, {
      phase: "preparing",
      message: "Preparing",
      completed: 0,
      total: 10,
    }),
    createAuctionExportProgress(exportId, {
      phase: "scraping-lots",
      message: "Scraping",
      completed: 3,
      total: 10,
    }),
    createAuctionExportProgress(exportId, {
      phase: "downloading-photos",
      message: "Photos",
      completed: 7,
      total: 10,
    }),
    createAuctionExportProgress(exportId, {
      phase: "complete",
      message: "Done",
      completed: 10,
      total: 10,
    }),
  ];

  let previous = -1;
  for (const step of steps) {
    assert.ok(step.percent >= previous);
    previous = step.percent;
  }
  assert.equal(steps.at(-1)?.percent, 100);
});

test("auction export filename uses Windows-safe date and timestamp", () => {
  const name = buildAuctionExportFileName(new Date("2026-07-18T16:45:32"));
  assert.equal(name, "broad-arrow-auction-2026-07-18-164532");
  assert.ok(!name.includes(":"));
  assert.ok(!name.includes("/"));
  assert.ok(!name.includes("\\"));
});

test("auction export package json matches folder base name", () => {
  const root = fs.mkdtempSync(path.join(process.cwd(), ".tmp-auction-export-"));
  try {
    const outputPath = resolveUniqueAuctionExportPath(root, new Date("2026-07-18T16:45:32"));
    const folderName = path.basename(path.dirname(outputPath));
    assert.equal(path.basename(outputPath), `${folderName}.json`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("duplicate export timestamps add numeric suffix", () => {
  const root = fs.mkdtempSync(path.join(process.cwd(), ".tmp-auction-export-dup-"));
  try {
    const first = resolveUniqueAuctionExportPath(root, new Date("2026-07-18T16:45:32"));
    fs.mkdirSync(path.dirname(first), { recursive: true });
    fs.writeFileSync(first, "{}", "utf8");
    const second = resolveUniqueAuctionExportPath(root, new Date("2026-07-18T16:45:32"));
    assert.match(path.basename(path.dirname(second)), /-2$/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("resolveAuctionJsonPathInPackage supports named and legacy json files", () => {
  const root = fs.mkdtempSync(path.join(process.cwd(), ".tmp-auction-json-"));
  try {
    const namedDir = path.join(root, "broad-arrow-auction-2026-07-18-164532");
    fs.mkdirSync(namedDir, { recursive: true });
    fs.writeFileSync(path.join(namedDir, "broad-arrow-auction-2026-07-18-164532.json"), "{}", "utf8");
    assert.equal(
      path.basename(resolveAuctionJsonPathInPackage(namedDir) ?? ""),
      "broad-arrow-auction-2026-07-18-164532.json",
    );

    const legacyDir = path.join(root, "legacy-package");
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, "auction.json"), "{}", "utf8");
    assert.equal(path.basename(resolveAuctionJsonPathInPackage(legacyDir) ?? ""), "auction.json");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("lot thumbnail normalization filters placeholder and prefers local asset urls", () => {
  const photos = normalizeLotThumbnailPhotos(
    {
      lot: "126",
      title: "Test Lot",
      photos: [
        "https://example.com/placeholder-logo.png",
        {
          relativePath: "photos/lot-126/001.jpg",
          sourceUrl: "https://example.com/001.jpg",
        },
        "https://example.com/002.jpg",
      ],
    },
    (relativePath) => `/api/offline-assets/pkg/${relativePath}`,
  );

  assert.equal(photos.length, 2);
  assert.ok(photos[0]?.url.includes("/api/offline-assets/"));
  assert.equal(photos[0]?.source, "local");
  assert.equal(photos[1]?.source, "remote");
});

test("controller shows progress bar and preserves manual bid draft state", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");

  assert.ok(controller.includes('role="progressbar"'));
  assert.ok(controller.includes("exportProgress.percent"));
  assert.ok(controller.includes("parseManualBidDraft"));
  assert.ok(controller.includes("!bidIsDirtyRef.current"));
  assert.ok(!controller.includes('if (displaySource !== "local-controller") return true;'));
  assert.ok(controller.includes("LotPhotoThumbnails"));
});

test("load dialog opens in auction-data folder with json filter", () => {
  const ipc = readSrc("desktop/src/ipc/offline-auction.ts");
  assert.ok(ipc.includes("defaultPath: auctionDataDir"));
  assert.ok(ipc.includes('extensions: ["json"]'));
  assert.ok(ipc.includes("getAuctionDataDirectory()"));
});

test("offline export progress payload is serializable", () => {
  const progress = createAuctionExportProgress("abc", {
    phase: "downloading-photos",
    message: "Downloading photos for lot 126",
    completed: 74,
    total: 128,
  });
  assert.doesNotThrow(() => JSON.stringify(progress));
  assert.equal(typeof progress.percent, "number");
  assert.equal(progress.exportId, "abc");
});
