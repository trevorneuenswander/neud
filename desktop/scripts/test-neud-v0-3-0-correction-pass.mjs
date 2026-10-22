#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const LOT_PHOTOS_BRIDGE_ANCHOR = "/*__NEUD_LOT_PHOTOS_BRIDGE__*/";

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function transformLotPhotosHtmlForServing(html) {
  const bridge = read("desktop/src/displays/lot-photos-v1-bridge.js");
  assert.match(html, new RegExp(LOT_PHOTOS_BRIDGE_ANCHOR.replace(/[/*]/g, "\\$&")));
  return html.replace(LOT_PHOTOS_BRIDGE_ANCHOR, bridge);
}

function loadLotPhotosRuntime() {
  const html = transformLotPhotosHtmlForServing(
    read("desktop/src/displays/bundled/lot-photos-v1.html"),
  );
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/i);
  assert.ok(scriptMatch, "Lot Photos HTML must include runtime script");

  const photosShown = [];
  const context = {
    window: {
      innerWidth: 1920,
      innerHeight: 1080,
      addEventListener() {},
      NEUDDisplay: {
        subscribe(cb) {
          context.__subscribe = cb;
        },
        getSnapshot() {
          return null;
        },
        signalReady() {},
      },
      parent: { postMessage() {} },
      __NEUD_DISPLAY_DATA_DISCONNECTED__: false,
    },
    document: {
      getElementById(id) {
        if (id === "stage") {
          return {
            style: {},
            getAttribute(name) {
              return this.attrs?.[name] ?? null;
            },
            setAttribute(name, value) {
              this.attrs = this.attrs || {};
              this.attrs[name] = value;
            },
            attrs: {},
          };
        }
        if (id === "photoA" || id === "photoB") {
          return {
            classList: {
              _classes: new Set(id === "photoA" ? ["photo", "is-visible"] : ["photo"]),
              add(name) {
                this._classes.add(name);
              },
              remove(name) {
                this._classes.delete(name);
              },
            },
            getAttribute(name) {
              return this.attrs?.[name] ?? null;
            },
            setAttribute(name, value) {
              this.attrs = this.attrs || {};
              this.attrs[name] = value;
            },
            removeAttribute(name) {
              if (this.attrs) delete this.attrs[name];
            },
            set src(value) {
              this.attrs = this.attrs || {};
              this.attrs.src = value;
              photosShown.push(value);
              globalThis.queueMicrotask(() => {
                if (typeof this.onload === "function") this.onload();
              });
            },
            get src() {
              return this.attrs?.src ?? "";
            },
            onload: null,
            onerror: null,
            attrs: {},
          };
        }
        return null;
      },
    },
    Image: function Image() {
      this.onload = null;
      this.onerror = null;
      Object.defineProperty(this, "src", {
        set() {
          globalThis.queueMicrotask(() => {
            if (typeof this.onload === "function") this.onload();
          });
        },
      });
    },
    setInterval(fn) {
      context.__intervals = context.__intervals || [];
      context.__intervals.push(fn);
      return context.__intervals.length;
    },
    clearInterval() {},
    queue: globalThis.queue,
    console,
  };
  context.window.document = context.document;
  context.window.Image = context.Image;
  context.window.queueMicrotask = globalThis.queueMicrotask;
  vm.createContext(context);
  vm.runInContext(scriptMatch[1], context);
  return { context, photosShown };
}

test("LOT PHOTOS: package includes required assets and bridge transform", () => {
  const html = read("desktop/src/displays/bundled/lot-photos-v1.html");
  const bridge = read("desktop/src/displays/lot-photos-v1-bridge.js");
  const importService = read(
    "desktop/src/services/broad-arrow-stream-displays-import-service.ts",
  );
  const packageBuilder = read("desktop/src/packages/broad-arrow-package-builder.ts");
  const specs = read("desktop/src/displays/broad-arrow-stream-display-specs.ts");
  assert.match(html, /3840/);
  assert.match(html, /2160/);
  assert.match(html, /__NEUD_LOT_PHOTOS_BRIDGE__/);
  assert.match(bridge, /resolveLocalPhotoUrls|resolveDisplayPhotoUrls/);
  assert.match(importService, /transformLotPhotosHtmlForServing/);
  assert.match(specs, /slug: "lot-photos"/);
  assert.match(specs, /lot-photos-v1\.html/);
  assert.match(packageBuilder, /BROAD_ARROW_STREAM_DISPLAY_SPECS/);
  const served = transformLotPhotosHtmlForServing(html);
  assert.match(served, /lot-photos-v1-bridge/);
  assert.doesNotMatch(served, /\/\*__NEUD_LOT_PHOTOS_BRIDGE__\*\//);
  assert.match(served, /__NEUD_LOT_PHOTOS_ADAPTER__/);
});

test("LOT PHOTOS: first valid photo appears and slideshow advances", async () => {
  const { context, photosShown } = loadLotPhotosRuntime();
  assert.equal(typeof context.window.render, "function");
  context.window.render({
    auctionDisplay: {
      photos: [
        "/api/offline-assets/a.jpg",
        "/api/offline-assets/b.jpg",
      ],
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(photosShown[0], "/api/offline-assets/a.jpg");
  assert.ok(context.__intervals?.length >= 1, "slideshow timer must start");
  context.__intervals[0]();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(photosShown.includes("/api/offline-assets/b.jpg"));
});

test("LOT PHOTOS: lot change invalidates prior-lot callbacks", async () => {
  const { context, photosShown } = loadLotPhotosRuntime();
  context.window.render({
    auctionDisplay: { photos: ["/api/offline-assets/lot1-a.jpg"] },
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const generationBefore = context.window.__NEUD_LOT_PHOTOS__.getPhotoSessionGeneration();
  context.window.render({
    auctionDisplay: { photos: ["/api/offline-assets/lot2-a.jpg"] },
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const generationAfter = context.window.__NEUD_LOT_PHOTOS__.getPhotoSessionGeneration();
  assert.ok(generationAfter > generationBefore);
  assert.equal(
    context.window.__NEUD_LOT_PHOTOS__.getPhotoList()[0],
    "/api/offline-assets/lot2-a.jpg",
  );
  assert.ok(photosShown.includes("/api/offline-assets/lot2-a.jpg"));
});

test("LOT PHOTOS: bridge maps current.photos for local preview/local URL", () => {
  const { context, photosShown } = loadLotPhotosRuntime();
  assert.equal(typeof context.__subscribe, "function");
  context.__subscribe({
    current: {
      photos: [
        { displayUrl: "/api/offline-assets/from-current.jpg", remoteUrl: "https://x/y.jpg" },
      ],
    },
  });
  return new Promise((resolve) => {
    setTimeout(() => {
      assert.ok(photosShown.includes("/api/offline-assets/from-current.jpg"));
      resolve();
    }, 30);
  });
});

test("PINNED LAYOUT: title is attached under each display card", () => {
  const live = read("src/components/displays/PinnedDisplayLiveSlot.tsx");
  const stack = read("src/components/displays/PinnedDisplayStackSlot.tsx");
  assert.match(live, /data-pinned-display-card/);
  assert.match(live, /data-pinned-display-title/);
  assert.match(live, /data-pinned-preview-wrapper[\s\S]*data-pinned-display-title/s);
  assert.match(stack, /data-pinned-display-card/);
  assert.match(stack, /data-pinned-display-title/);
  assert.match(live, /regionHeight: Math\.max\(0, regionRect\.height - NAME_ROW_PX\)/);
});

test("NAV / ICON: Broad Arrow and SEMA omit project Activity; Outputs uses monitor icon", () => {
  const nav = read("src/components/projects/ProjectNav.tsx");
  const icons = read("src/lib/portal/sidebar-nav-icons.tsx");
  assert.doesNotMatch(nav, /href: "\/activity"/);
  // Data Source label comes from package nav items (SEMA/BA), rendered via item.label.
  assert.match(nav, /google-sheet/);
  assert.match(nav, /item\.label/);
  assert.match(read("desktop/src/packages/sema-package-builder.ts"), /label:\s*"Data Source"/);
  assert.match(icons, /SidebarOutputIcon/);
  assert.match(icons, /normalized === "output" \|\| normalized === "outputs"/);
  assert.match(icons, /<rect x="3" y="5" width="18" height="12"/);
});

test("PROJECTS PAGE: Package column left-aligned; Uninstall precedes status text; no Open", () => {
  const actions = read("src/components/projects/ProjectPackageActions.tsx");
  assert.match(actions, /items-start/);
  assert.match(actions, /justify-start/);
  assert.doesNotMatch(actions, /\bOpen\b/);
  const downloadButtonIdx = actions.indexOf('{busy ? "Downloading…" : "Download"}');
  const uninstallButtonIdx = actions.indexOf("Uninstall");
  const statusRenderIdx = actions.indexOf("{statusText}");
  assert.ok(downloadButtonIdx > 0 && statusRenderIdx > downloadButtonIdx);
  assert.ok(uninstallButtonIdx > 0 && uninstallButtonIdx < statusRenderIdx);
});

test("PIN CONTEXT MENU: portals to document.body above shell", () => {
  const menu = read("src/components/displays/PinnedViewerContextMenu.tsx");
  assert.match(menu, /createPortal/);
  assert.match(menu, /document\.body/);
  assert.match(menu, /z-\[2000\]/);
  assert.match(menu, /data-pinned-viewer-context-menu/);
});

test("TEAMS: column spacing, left Actions, Create/Manage modals, no Show Members", () => {
  const panel = read("src/components/access-management/TeamsPanel.tsx");
  const layout = read("src/lib/access-management/table-layout.ts");
  assert.match(layout, /\["30%", "12%", "12%", "16%", "18%"\]/);
  assert.match(panel, /justify-start/);
  assert.doesNotMatch(panel, /Show members/);
  assert.doesNotMatch(panel, /showCreateForm/);
  assert.match(panel, /NeudModal/);
  assert.match(panel, /Create Team/);
  assert.match(panel, /Manage \$\{selectedTeam\.name\}|Manage \{selectedTeam\.name\}|Manage \$\{/);
  assert.match(panel, /Members/);
  assert.match(panel, /selectedMembers/);
});

test("PROJECT ACCESS: SEMA cloud project ensured; installed-state not required", () => {
  const enumMigration = read("supabase/migrations/056_sema_schedule_project_type.sql");
  const seedMigration = read("supabase/migrations/057_ensure_sema_cloud_project.sql");
  const hardenMigration = read(
    "supabase/migrations/058_harden_sema_seed_in_directory_rpc.sql",
  );
  const panel = read("src/components/access-management/ProjectAccessPanel.tsx");
  assert.match(enumMigration, /sema-schedule/);
  assert.match(seedMigration, /ensure_sema_cloud_project/);
  assert.match(seedMigration, /slug = 'sema'/);
  assert.match(seedMigration, /perform public\.ensure_sema_cloud_project/);
  assert.match(hardenMigration, /exception\s+when others then/);
  assert.match(hardenMigration, /semaSeed/);
  assert.match(panel, /directory\.projects|projects\.map/);
  assert.doesNotMatch(panel, /isPackageInstalled|packageState|installedVersion/);
  assert.match(seedMigration, /Broad Arrow|sema/i);
});
