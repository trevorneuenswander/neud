#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { openLocalDatabase, closeLocalDatabase } from "../dist/database/connection.js";
import { ProjectsRepository } from "../dist/repositories/projects-repository.js";
import { DisplaysRepository } from "../dist/repositories/displays-repository.js";
import { ProjectDisplayCodeRepository } from "../dist/repositories/project-display-code-repository.js";
import { ProjectCodeRevisionsRepository } from "../dist/repositories/project-code-revisions-repository.js";
import { ProjectCodeStorageService } from "../dist/services/project-code-storage-service.js";
import { resolveDisplayRuntimeAdapterKey } from "../dist/displays/html-display-runtime-adapters.js";
import { hashSource } from "../dist/repositories/project-scraper-code-repository.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const STORED_V1_HASH = "1C5B432B945CC213419A3584CA7142660443668AF27716CFCD53BDE5A127C5F5";

function resolveCliAppPaths() {
  const appDataRoot = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
  const root = path.join(appDataRoot, "NEUD");
  return {
    root,
    data: path.join(root, "data"),
    databaseFile: path.join(root, "data", "neud.sqlite"),
    projects: path.join(root, "projects"),
    repoRoot,
  };
}

async function fetchDisplayHtml(projectId, slug, output = true) {
  const query = output ? "?mode=output&poll=1000" : "?preview=1&poll=1000";
  const urls = [
    ["local-api", `http://127.0.0.1:8070/api/display/${encodeURIComponent(projectId)}/${encodeURIComponent(slug)}${query}`],
    ["next-proxy", `http://127.0.0.1:3000/api/display-html/${encodeURIComponent(projectId)}/${encodeURIComponent(slug)}${query}`],
    ["next-display", `http://127.0.0.1:3000/display/${encodeURIComponent(projectId)}/${encodeURIComponent(slug)}${query}`],
  ];

  for (const [label, url] of urls) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) {
        return { label, url, html: await response.text(), status: response.status };
      }
    } catch {
      // try next
    }
  }
  return null;
}

async function fetchDisplayData(projectId, slug, preview = false) {
  const query = preview ? "?preview=1" : "";
  const url = `http://127.0.0.1:8070/api/display/${encodeURIComponent(projectId)}/${encodeURIComponent(slug)}/data${query}`;
  try {
    const response = await fetch(url, { cache: "no-store" });
    return { url, json: await response.json(), status: response.status };
  } catch {
    return null;
  }
}

function createDomSandbox(html) {
  const elements = new Map();

  function makeEl(id) {
    const el = {
      id,
      textContent: "",
      classList: {
        _values: new Set(),
        add(...values) {
          values.forEach((value) => this._values.add(value));
        },
        remove(...values) {
          values.forEach((value) => this._values.delete(value));
        },
        contains(value) {
          return this._values.has(value);
        },
      },
      style: {},
      setAttribute(name, value) {
        this[`attr:${name}`] = value;
      },
      getAttribute(name) {
        return this[`attr:${name}`] ?? null;
      },
      querySelector() {
        return { textContent: "", style: {}, setAttribute() {}, getAttribute() { return ""; } };
      },
      appendChild() {},
      removeChild() {},
      innerHTML: "",
      src: "",
    };
    elements.set(id, el);
    return el;
  }

  const document = {
    getElementById(id) {
      return elements.get(id) ?? makeEl(id);
    },
    createElement() {
      return makeEl(`generated-${elements.size}`);
    },
    body: makeEl("body"),
    documentElement: makeEl("html"),
  };

  const sandbox = {
    document,
    console,
    setTimeout,
    setInterval,
    clearInterval,
    clearTimeout,
    window: {},
    ENDPOINT: null,
    POLL: 1000,
    poll() {},
    statusEl: makeEl("status"),
    renderCalls: [],
  };

  sandbox.window = sandbox;
  sandbox.window.parent = sandbox.window;
  sandbox.window.location = { origin: "http://127.0.0.1:3000", href: "http://127.0.0.1:3000" };
  sandbox.window.addEventListener = () => {};
  sandbox.window.postMessage = () => {};
  sandbox.window.render = (feed) => sandbox.renderCalls.push(feed);

  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
  const scriptBody = scripts.find((source) => /function render\(/.test(source)) ?? scripts.at(-1) ?? "";
  vm.createContext(sandbox);
  if (scriptBody) {
    vm.runInContext(scriptBody, sandbox);
  }

  return { sandbox, elements };
}

async function main() {
  const paths = resolveCliAppPaths();
  console.log("=== NEUD Legacy Pylon Diagnostic ===\n");
  console.log(`Database: ${paths.databaseFile}`);

  if (!fs.existsSync(paths.databaseFile)) {
    console.error("Database not found. Start NEUD desktop first.");
    process.exit(1);
  }

  const db = await openLocalDatabase(paths);
  const projects = new ProjectsRepository(db);
  const displaysRepo = new DisplaysRepository(db);
  const displayCode = new ProjectDisplayCodeRepository(db);
  const revisions = new ProjectCodeRevisionsRepository(db);
  const storage = new ProjectCodeStorageService(paths);

  let target = null;
  for (const project of projects.list()) {
    const code = displayCode.getBySlug(project.id, "legacy-pylon");
    if (code) {
      target = { project, code, display: displaysRepo.getById(code.displayId) };
      break;
    }
  }

  if (!target?.display) {
    console.error("Legacy Pylon display not found. Restart NEUD desktop to run import.");
    await closeLocalDatabase(db);
    process.exit(1);
  }

  const { project, code, display } = target;
  const settings = display.settings ?? {};
  const adapterKey = resolveDisplayRuntimeAdapterKey({
    projectId: project.id,
    projectSlug: project.slug,
    displayId: display.id,
    slug: code.slug,
    displayKey: display.displayKey,
    settings,
    runtimeAdapterKey: settings.runtimeAdapterKey,
  });

  const published = storage.readDisplayPublished(project.id, display.id);
  const storedHash = hashSource(published.html).toUpperCase();
  const revisionList = revisions.listForResource({
    projectId: project.id,
    resourceType: "display",
    resourceId: display.id,
  });
  const activeRevision = revisionList.find((row) => row.id === code.publishedRevisionId);

  const data = await fetchDisplayData(project.id, code.slug, false);
  const payload = data?.json ?? {};
  const canonicalPylon =
    payload.broadArrowDisplay?.pylon ??
    payload.auctionDisplay ??
    payload.broadArrowDisplay?.current ??
    payload.snapshot?.auctionDisplay ??
    null;

  const output = await fetchDisplayHtml(project.id, code.slug, true);
  const preview = await fetchDisplayHtml(project.id, code.slug, false);

  console.log("\n--- Display record ---");
  console.log(`Legacy Pylon display ID: ${display.id}`);
  console.log(`Slug: ${code.slug}`);
  console.log(`Import key: ${settings.importKey ?? "(none)"}`);
  console.log(`Active label: ${activeRevision?.revisionName ?? "(unknown)"}`);
  console.log(`Runtime adapter key: ${settings.runtimeAdapterKey ?? "(none)"}`);
  console.log(`Runtime adapter matched: ${adapterKey}`);
  console.log(`Stored source hash: ${storedHash}`);
  console.log(`Expected stored hash: ${STORED_V1_HASH}`);
  console.log(`Stored hash stable: ${storedHash === STORED_V1_HASH}`);

  console.log("\n--- Canonical data ---");
  console.log(`Data URL: ${data?.url ?? "(unavailable)"}`);
  console.log(`Canonical current lot: ${canonicalPylon?.lot ?? "(none)"}`);
  console.log(`Canonical title: ${canonicalPylon?.title ?? "(none)"}`);
  console.log(`Canonical bid: ${canonicalPylon?.biddingPrice ?? canonicalPylon?.price ?? "(none)"}`);
  console.log(`Canonical reserve: ${canonicalPylon?.reserveStatus ?? "(none)"}`);
  console.log(`Canonical photos: ${Array.isArray(canonicalPylon?.photos) ? canonicalPylon.photos.length : 0}`);

  console.log("\n--- Served HTML ---");
  if (output) {
    console.log(`Local URL used (${output.label}): ${output.url}`);
    console.log(`Output has bridge: ${/initializeNeudPylonBridge/.test(output.html)}`);
    console.log(`Output has runtime script: ${/neud-display-runtime\.js/.test(output.html)}`);
    console.log(`Output has poll guard: ${/__NEUD_RUNTIME_MANAGED_DISPLAY__/.test(output.html)}`);
    console.log(`Output has Next.js indicator: ${/nextjs-portal|__nextjs|nextjs-dev-tools/i.test(output.html)}`);
  } else {
    console.log("Output URL fetch failed.");
  }
  if (preview) {
    console.log(`Preview URL (${preview.label}): ${preview.url}`);
    console.log(`Preview has Next.js indicator: ${/nextjs-portal|__nextjs|nextjs-dev-tools/i.test(preview.html)}`);
  }

  const logoPath = path.join(repoRoot, "public", "displays", "pylon", "logo.png");
  console.log(`\nLogo asset at public/displays/pylon/logo.png: ${fs.existsSync(logoPath) ? "present" : "MISSING"}`);

  const bridgeSource = fs.readFileSync(
    path.join(repoRoot, "desktop/src/displays/legacy-pylon-live-bridge.js"),
    "utf8",
  );
  const dom = createDomSandbox(published.html);
  const bridgeSandbox = {
    ...dom.sandbox,
    NEUDDisplay: {
      getSnapshot: () => payload,
      subscribe(callback) {
        callback(payload);
        return () => {};
      },
      signalReady() {},
    },
  };
  bridgeSandbox.window = bridgeSandbox;
  bridgeSandbox.window.NEUDDisplay = bridgeSandbox.NEUDDisplay;
  bridgeSandbox.window.render = bridgeSandbox.render;
  vm.createContext(bridgeSandbox);
  vm.runInContext(bridgeSource, bridgeSandbox);

  const mapped = bridgeSandbox.renderCalls.at(-1)?.auctionDisplay;
  console.log("\n--- Bridge mapping ---");
  console.log(`typeof window.NEUDDisplay: ${typeof bridgeSandbox.NEUDDisplay}`);
  console.log(`typeof window.render: ${typeof bridgeSandbox.render}`);
  console.log(`Subscriber installed: ${bridgeSandbox.window.__NEUD_LEGACY_PYLON_ADAPTER_INSTALLED__ === true}`);
  console.log(`Mapped lot: ${mapped?.lot ?? "(none)"}`);
  console.log(`Mapped title: ${mapped?.title ?? "(none)"}`);
  console.log(`Mapped bid: ${mapped?.biddingPrice ?? "(none)"}`);
  console.log(`Mapped reserve: ${mapped?.reserveStatus ?? "(none)"}`);
  console.log(`Mapped photo URL: ${mapped?.photos?.[0] ?? "(none)"}`);

  if (mapped && typeof dom.sandbox.render === "function") {
    dom.sandbox.render({ auctionDisplay: mapped });
    console.log("\n--- Rendered DOM ---");
    console.log(`Rendered lot: ${dom.elements.get("lot")?.textContent ?? "(missing)"}`);
    console.log(`Rendered title data-title: ${dom.elements.get("titleWrap")?.getAttribute("data-title") ?? "(missing)"}`);
    console.log(`Rendered bid: ${dom.elements.get("price")?.textContent ?? "(missing)"}`);
    console.log(
      `Reserve visible: ${dom.elements.get("reserveText")?.classList.contains("hidden") === false}`,
    );
    console.log(
      `Main photo visible: ${dom.elements.get("mainPhoto")?.classList.contains("hidden") === false}`,
    );
  }

  const allDisplays = displaysRepo.listByProject(project.id);
  console.log("\n--- Displays on project ---");
  console.log(allDisplays.map((row) => `${row.sortOrder}. ${row.name} (${row.displayKey})`).join("\n"));
  console.log(
    `Retired auction-pylon-display present: ${allDisplays.some((row) => row.displayKey === "auction-pylon-display")}`,
  );

  await closeLocalDatabase(db);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
