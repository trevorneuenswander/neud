#!/usr/bin/env node
/**
 * Static + optional live probe for Broad Arrow photo pipeline.
 * Does not print URLs, filenames, or payload values.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  getRepoRoot,
  loadLiveValidationEnv,
} from "./lib/env.mjs";
import { readLocalBroadArrowState, resolveLocalNeudDatabasePath } from "./lib/local-neud-db.mjs";
import { migrationChecksum } from "./lib/migrations.mjs";
import { sanitizeError } from "./lib/sanitize.mjs";

const BROAD_ARROW_SLUG = "broad-arrow-auctions";

function classifyPhotoEntry(entry) {
  if (typeof entry === "string") {
    return {
      valueType: "string",
      hasLocalUrl: false,
      hasRemoteUrl: false,
      hasOriginalUrl: false,
      hasFilename: false,
      urlCategory: categorizeUrl(entry),
    };
  }
  if (!entry || typeof entry !== "object") {
    return {
      valueType: "missing",
      hasLocalUrl: false,
      hasRemoteUrl: false,
      hasOriginalUrl: false,
      hasFilename: false,
      urlCategory: "missing",
    };
  }
  const localUrl = typeof entry.localUrl === "string" ? entry.localUrl : null;
  const remoteUrl = typeof entry.remoteUrl === "string" ? entry.remoteUrl : null;
  const originalUrl = typeof entry.originalUrl === "string" ? entry.originalUrl : null;
  return {
    valueType: "object",
    hasLocalUrl: Boolean(localUrl),
    hasRemoteUrl: Boolean(remoteUrl),
    hasOriginalUrl: Boolean(originalUrl),
    hasFilename: typeof entry.filename === "string" && entry.filename.trim().length > 0,
    urlCategory: categorizeUrl(remoteUrl ?? originalUrl ?? localUrl ?? ""),
  };
}

function categorizeUrl(url) {
  if (!url || typeof url !== "string" || !url.trim()) {
    return "missing";
  }
  const trimmed = url.trim();
  if (/^file:/i.test(trimmed)) return "file://";
  if (/^[a-zA-Z]:\\|^\\\\/.test(trimmed)) return "windows-path";
  if (/127\.0\.0\.1|localhost/i.test(trimmed)) return "localhost";
  if (trimmed.includes("/api/offline-assets/")) return "offline-assets-api";
  if (/^https:\/\//i.test(trimmed)) return "https-remote";
  if (/^http:\/\//i.test(trimmed)) return "http-non-https";
  if (/^photos\//i.test(trimmed) || /^images\//i.test(trimmed)) return "relative-path";
  return "other";
}

async function loadPhotoResolver(repoRoot) {
  try {
    const moduleUrl = pathToFileURL(
      path.join(repoRoot, "shared/display-runtime/canonical-photo.ts"),
    ).href;
    return await import(moduleUrl);
  } catch {
    return null;
  }
}

async function loadSanitizer(repoRoot) {
  try {
    const moduleUrl = pathToFileURL(
      path.join(repoRoot, "shared/publishing/sanitize.ts"),
    ).href;
    return await import(moduleUrl);
  } catch {
    return null;
  }
}

async function readLocalPipelineHints(repoRoot, projectId) {
  const databasePath = resolveLocalNeudDatabasePath(repoRoot);
  if (!fs.existsSync(databasePath)) {
    return { available: false, databasePath };
  }

  let initSqlJs;
  try {
    initSqlJs = (await import("sql.js")).default;
  } catch {
    return { available: false, databasePath, reason: "sql.js unavailable" };
  }

  const wasmCandidates = [
    path.join(repoRoot, "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
    path.join(repoRoot, "desktop", "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
  ];
  const wasmPath = wasmCandidates.find((candidate) => fs.existsSync(candidate));
  if (!wasmPath) {
    return { available: false, databasePath, reason: "wasm missing" };
  }

  const SQL = await initSqlJs({
    locateFile: (fileName) =>
      fileName === "sql-wasm.wasm" ? wasmPath : path.join(path.dirname(wasmPath), fileName),
  });
  const db = new SQL.Database(fs.readFileSync(databasePath));

  const parseSetting = (key) => {
    const rows = db.exec(`SELECT value_json FROM app_settings WHERE key = '${key.replace(/'/g, "''")}'`);
    const raw = rows[0]?.values?.[0]?.[0];
    if (raw == null) return null;
    try {
      return JSON.parse(String(raw));
    } catch {
      return String(raw);
    }
  };

  const displayDataSource = parseSetting("displayDataSource");
  const projectPipeline = projectId
    ? parseSetting(`canonical.pipeline.project.${projectId}`)
    : null;

  db.close();
  return {
    available: true,
    databasePath,
    displayDataSource,
    projectPipeline,
  };
}

function summarizePhotoArray(photos, resolver, sanitizer) {
  const list = Array.isArray(photos) ? photos : [];
  const entrySummaries = list.map((entry) => classifyPhotoEntry(entry));

  let hostedEligibleRemoteCount = 0;
  let localOnlyCount = 0;
  let missingSourceCount = 0;
  const rejectedByReason = {
    sanitize_dropped_object: 0,
    sanitize_dropped_local_string: 0,
    hosted_no_https_remote: 0,
    hosted_local_only_object: 0,
    empty_entry: 0,
  };

  if (resolver) {
    const hostedUrls = resolver.resolvePhotoUrlsForHostedDisplay(list);
    hostedEligibleRemoteCount = hostedUrls.length;
    const summary = resolver.summarizeCanonicalPhotoSources(list);
    localOnlyCount = summary.localCount + summary.rejectedLocalOnlyCount;
    missingSourceCount = list.length - hostedEligibleRemoteCount - summary.rejectedLocalOnlyCount;
  }

  if (sanitizer) {
    const sanitized = sanitizer.sanitizeCanonicalProjectData({
      auctionDisplay: { photos: list },
      updatedAt: new Date().toISOString(),
      dataSource: "local-controller",
    });
    const after = sanitized?.auctionDisplay?.photos ?? [];
    const droppedObjects = entrySummaries.filter((e) => e.valueType === "object").length;
    if (droppedObjects > 0 && after.length === 0) {
      rejectedByReason.sanitize_dropped_object = droppedObjects;
    }
  }

  for (const entry of entrySummaries) {
    if (entry.valueType === "missing") {
      rejectedByReason.empty_entry += 1;
      continue;
    }
    if (entry.valueType === "object" && !entry.hasRemoteUrl && !entry.hasOriginalUrl) {
      rejectedByReason.hosted_local_only_object += 1;
    }
    if (entry.valueType === "string" && ["localhost", "offline-assets-api", "file://", "windows-path"].includes(entry.urlCategory)) {
      rejectedByReason.sanitize_dropped_local_string += 1;
    }
    if (entry.valueType === "string" && entry.urlCategory === "https-remote") {
      // scraper path — passes sanitize + hosted
    } else if (entry.hasRemoteUrl || entry.hasOriginalUrl) {
      // may still fail hosted if not https
      if (entry.urlCategory !== "https-remote") {
        rejectedByReason.hosted_no_https_remote += 1;
      }
    }
  }

  return {
    photoCount: list.length,
    stringCount: entrySummaries.filter((e) => e.valueType === "string").length,
    objectCount: entrySummaries.filter((e) => e.valueType === "object").length,
    withRemoteUrlCount: entrySummaries.filter((e) => e.hasRemoteUrl || e.hasOriginalUrl).length,
    withLocalUrlOnlyCount: entrySummaries.filter(
      (e) => e.hasLocalUrl && !e.hasRemoteUrl && !e.hasOriginalUrl,
    ).length,
    hostedEligibleRemoteCount,
    localOnlyCount,
    missingSourceCount,
    rejectedByReason,
    browserRequestAttempted: hostedEligibleRemoteCount > 0,
    browserResponseCategory:
      hostedEligibleRemoteCount > 0 ? "would-attempt-https-fetch" : "never-requested",
  };
}

function buildShapeDocument(source, photosSample) {
  const first = Array.isArray(photosSample) && photosSample.length > 0 ? photosSample[0] : null;
  return {
    source,
    arrayLocation: "auctionDisplay.photos",
    elementTypes: {
      scraperTypical: "string (https URL)",
      localControllerTypical: "object { localUrl?, remoteUrl?, originalUrl?, filename? }",
    },
    firstEntryShape: first == null ? null : classifyPhotoEntry(first),
    sanitizeBehavior:
      source === "webpage-scraper"
        ? "strings retained in sanitizeAllowedRecord photos branch"
        : "objects mapped through sanitizeString → dropped (null filtered)",
    hostedResolverBehavior:
      "resolvePhotoUrlsForHostedDisplay accepts https strings or object.remoteUrl/originalUrl only",
  };
}

async function main() {
  const repoRoot = getRepoRoot(import.meta.url);
  loadLiveValidationEnv(repoRoot);

  const resolver = await loadPhotoResolver(repoRoot);
  const sanitizer = await loadSanitizer(repoRoot);
  const localState = await readLocalBroadArrowState(repoRoot);
  const projectId = localState.project?.id ?? null;
  const hints = projectId
    ? await readLocalPipelineHints(repoRoot, projectId)
    : { available: false };

  const selectedSource = hints.displayDataSource ?? null;
  const localCanonicalPhotos =
    hints.projectPipeline?.auctionDisplayPhotoSample ??
    hints.projectPipeline?.localAuctionDisplayPhotos ??
    null;

  // Scraper shape from code contract (live scraper emits img.src strings)
  const scraperSamplePhotos = ["https://example.invalid/scraper-photo.jpg"];
  const localControllerSamplePhotos = [
    {
      localUrl: "http://127.0.0.1:3000/api/offline-assets/pkg/photos/lot-1_1.jpg",
      remoteUrl: "https://example.invalid/original.jpg",
      originalUrl: "https://example.invalid/original.jpg",
    },
    {
      localUrl: "http://127.0.0.1:3000/api/offline-assets/pkg/photos/lot-1_2.jpg",
    },
  ];

  const scraperShape = buildShapeDocument("webpage-scraper", scraperSamplePhotos);
  const localControllerShape = buildShapeDocument(
    "local-controller",
    localControllerSamplePhotos,
  );

  const scraperSummary = summarizePhotoArray(scraperSamplePhotos, resolver, sanitizer);
  const localControllerSummary = summarizePhotoArray(
    localControllerSamplePhotos,
    resolver,
    sanitizer,
  );

  let cloudPhotoCount = null;
  let cloudSanitizedPhotoCount = null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (url && serviceRoleKey && projectId) {
    const admin = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: project } = await admin
      .from("projects")
      .select("id")
      .eq("slug", BROAD_ARROW_SLUG)
      .maybeSingle();
    if (project?.id) {
      const { data: snapshot } = await admin
        .from("project_canonical_snapshots")
        .select("payload")
        .eq("project_id", project.id)
        .order("canonical_revision", { ascending: false })
        .limit(1)
        .maybeSingle();
      const payload = snapshot?.payload;
      const data = payload && typeof payload === "object" ? payload.data ?? payload : null;
      const photos =
        data?.auctionDisplay && typeof data.auctionDisplay === "object"
          ? data.auctionDisplay.photos
          : [];
      cloudPhotoCount = Array.isArray(photos) ? photos.length : 0;
      if (resolver && Array.isArray(photos)) {
        cloudSanitizedPhotoCount = resolver.resolvePhotoUrlsForHostedDisplay(photos).length;
      }
    }
  }

  const firstFailingStage =
    selectedSource === "local-controller"
      ? localControllerSummary.rejectedByReason.sanitize_dropped_object > 0
        ? "publish_sanitizer (sanitizeAllowedRecord drops photo objects before cloud write)"
        : localControllerSummary.hostedEligibleRemoteCount === 0
          ? "hosted_photo_resolver (no https remoteUrl/originalUrl after publish)"
          : "unknown — run with live local pipeline hints populated"
      : scraperSummary.hostedEligibleRemoteCount > 0
        ? "none in sample — scraper string path is structurally valid"
        : "publish or cloud snapshot unavailable";

  const recommendedTransport =
    localControllerSummary.withLocalUrlOnlyCount > 0
      ? "hybrid: preserve remoteUrl for scraper-origin downloads; cloud object storage for manual-upload local-only photos; extend sanitize to pass structured photo objects (not base64)"
      : "preserve https remoteUrl in structured canonical photos; fix publish sanitizer to retain objects";

  const report = {
    generatedAt: new Date().toISOString(),
    selectedSource,
    localDatabaseAvailable: localState.available,
    localProjectPresent: Boolean(projectId),
    scraperPhotoSummary: scraperSummary,
    localControllerPhotoSummary: localControllerSummary,
    canonicalPhotoCount: hints.projectPipeline?.localAuctionDisplayPhotoCount ?? null,
    cloudPhotoCount,
    cloudHostedEligibleCount: cloudSanitizedPhotoCount,
    firstFailingStage,
    recommendedTransportStrategy: recommendedTransport,
    photoOrigins: {
      scraperDownload: {
        retainsOriginalHttps: true,
        fields: ["displayUrl", "sourceUrl", "remoteUrl via mergeCanonicalPhotoInputs"],
        case: "A — scraper-origin with local JPG + sourceUrl",
      },
      manualUpload: {
        retainsOriginalHttps: false,
        fields: ["displayUrl only"],
        case: "B — local-only manual upload",
      },
      downloadedWithoutSourceUrl: {
        retainsOriginalHttps: false,
        case: "C — only if sourceUrl discarded (not typical for export runner)",
      },
    },
    structuralDivergence:
      "resolveLocalControllerDisplayData sets auctionDisplay.photos to CanonicalPhoto[] objects; scraper passes auctionDisplay.photos as string[]; sanitizeAllowedRecord keeps strings only",
    filesInspected: [
      "desktop/src/displays/resolve-local-controller-display-data.ts",
      "desktop/src/displays/canonical-project-data.ts",
      "shared/publishing/sanitize.ts",
      "shared/display-runtime/canonical-photo.ts",
      "desktop/src/displays/stream-bid-v2-bridge.js",
      "desktop/src/services/lot-manual-photo-import.ts",
      "desktop/src/services/broad-arrow-offline-export-runner.ts",
    ],
    transportOptions: {
      option1_preserveHttps: {
        suitableWhen: "sourceUrl/remoteUrl retained (scraper downloads)",
        blockedBy: "publish sanitizer today",
      },
      option2_cloudObjectStorage: {
        suitableWhen: "manual-upload local-only photos",
        notes: "Supabase Storage or equivalent; signed URLs; no service role in desktop bundle",
      },
      option3_binaryInCanonical: {
        recommendation: "reject for Alpha",
        reasons: ["payload size", "polling overhead", "row bloat", "cache inefficiency"],
      },
      option4_desktopProxy: {
        recommendation: "reject for general hosted viewers",
        reasons: ["NAT/firewall", "desktop must be online", "security"],
      },
      option5_preloadOnly: {
        recommendation: "complements transport; does not fix inaccessible URLs",
      },
    },
    explicitAnswers: {
      photosPresentLocally: "yes when lot has download package or manual import (localUrl/displayUrl)",
      photosPresentInCanonical: "yes as objects in auctionDisplay.photos before sanitize",
      photosPresentInCloud: cloudPhotoCount == null ? "unknown without live snapshot" : cloudPhotoCount > 0,
      photosHostAccessible: cloudSanitizedPhotoCount != null ? cloudSanitizedPhotoCount > 0 : "probe cloud snapshot",
      rejectedBeforeBrowser: firstFailingStage.includes("sanitizer") || firstFailingStage.includes("resolver"),
      preloadRelevant: false,
      originsRequiringCloudUpload: ["manual-upload", "any local-only object without remoteUrl"],
    },
  };

  fs.writeFileSync(
    path.join(repoRoot, "docs", "scraper-photo-canonical-shape.json"),
    `${JSON.stringify(scraperShape, null, 2)}\n`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(repoRoot, "docs", "local-controller-photo-canonical-shape.json"),
    `${JSON.stringify(localControllerShape, null, 2)}\n`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(repoRoot, "docs", "broad-arrow-photo-pipeline-diagnostic.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(sanitizeError(error).message);
  process.exit(1);
});
