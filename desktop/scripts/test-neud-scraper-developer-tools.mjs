import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const developerToolsRoute =
  "/projects/[slug]/data-engines/[engineId]/developer-tools";

test("developer tools button appears at bottom of bag webpage scraper for authorized users", () => {
  const detail = read("src/components/data-engines/EngineDetailClient.tsx");
  const configIndex = detail.indexOf("<BroadArrowConfigurationForm");
  const developerToolsIndex = detail.indexOf("Developer Tools");

  assert.ok(configIndex >= 0);
  assert.ok(developerToolsIndex > configIndex);
  assert.match(detail, /developer-tools/);
  assert.match(detail, /canDeveloperTools && shouldUseLocalDataClient\(\)/);
});

test("developer tools button is permission gated in renderer", () => {
  const detail = read("src/components/data-engines/EngineDetailClient.tsx");
  const content = read("src/components/data-engines/EngineDetailContent.tsx");

  assert.match(detail, /canDeveloperTools/);
  assert.match(content, /canDeveloperTools=\{projectAccess\.canManageSettings\}/);
});

test("developer tools route rejects unauthorized access", () => {
  const page = read(
    "src/app/(portal)/projects/[slug]/data-engines/[engineId]/developer-tools/page.tsx",
  );

  assert.match(page, /requireProjectAccess/);
  assert.match(page, /canManageSettings/);
  assert.match(page, /notFound\(\)/);
});

test("developer tools page uses dedicated route and project shell", () => {
  const page = read(
    "src/app/(portal)/projects/[slug]/data-engines/[engineId]/developer-tools/page.tsx",
  );
  const client = read("src/components/developer-tools/ScraperDeveloperDetailsClient.tsx");

  assert.match(page, /ScraperDeveloperDetailsClient/);
  assert.match(client, /Back to Webpage Scraper/);
  assert.match(client, /PageHeader/);
  assert.match(client, /title="Developer Tools"/);
  assert.match(client, /Webpage Scraper · \$\{projectName\}/);
});

test("developer tools metadata shows adapter and revision identifiers", () => {
  const client = read("src/components/developer-tools/ScraperDeveloperDetailsClient.tsx");
  const api = read("src/lib/local/developer-tools-api.ts");
  const service = read("desktop/src/services/developer-tools-service.ts");

  assert.match(client, /label="Adapter"/);
  assert.match(client, /label="Active Revision"/);
  assert.match(client, /label="Draft Revision"/);
  assert.match(api, /adapter: string \| null/);
  assert.match(service, /adapter: adapterName/);
});

test("broad arrow resolves bag-auction adapter in developer context", () => {
  const service = read("desktop/src/services/developer-tools-service.ts");
  assert.match(service, /engine\?\.config\?\.adapter/);
});

test("developer tools reuses draft publish revision workflow", () => {
  const client = read("src/components/developer-tools/ScraperDeveloperDetailsClient.tsx");
  const editor = read("src/components/developer-tools/ScraperCodeEditor.tsx");
  const revisions = read("src/components/developer-tools/CodeRevisionsPanel.tsx");

  assert.match(client, /ScraperCodeEditor/);
  assert.match(client, /ScraperRevisionsPanel/);
  assert.match(editor, /Save Draft/);
  assert.match(editor, /Validate/);
  assert.match(editor, /Publish/);
  assert.match(revisions, /restore/i);
});

test("developer tools backend enforces owner and admin access", () => {
  const service = read("desktop/src/services/developer-tools-service.ts");
  const routes = read("desktop/src/services/developer-tools-routes.ts");

  assert.match(service, /assertDeveloperToolsAccess/);
  assert.match(service, /owners and admins/i);
  assert.match(routes, /developer-tools/);
});

test("runtime uses published revision with bundled baseline fallback", () => {
  const migration = read("desktop/src/services/developer-tools-service.ts");
  const storage = read("desktop/src/services/project-code-storage-service.ts");

  assert.match(migration, /readScraperPublished/);
  assert.match(migration, /ProjectCodeMigrationService/);
  assert.match(storage, /readScraperPublished/);
});

test("publish workflow validates before activation and preserves rollback semantics", () => {
  const service = read("desktop/src/services/developer-tools-service.ts");
  const client = read("src/components/developer-tools/ScraperDeveloperDetailsClient.tsx");

  assert.match(service, /validateScraperSource/);
  assert.match(service, /publishScraperDraft|publishScraper/i);
  assert.match(client, /rolls back/i);
});

test("developer tools canonical route matches engine detail navigation", () => {
  const detail = read("src/components/data-engines/EngineDetailClient.tsx");
  assert.match(detail, new RegExp(`/projects/\\$\\{projectSlug\\}/data-engines/\\$\\{engine.id\\}/developer-tools`));
  assert.match(
    read("src/app/(portal)/projects/[slug]/data-engines/[engineId]/developer-tools/page.tsx"),
    /developer-tools/,
  );
});

test("developer tools is not placed in accordion modal or global navigation", () => {
  const detail = read("src/components/data-engines/EngineDetailClient.tsx");
  const sidebar = read("src/components/portal/Sidebar.tsx");

  assert.doesNotMatch(detail, /DeveloperDrawer/);
  assert.doesNotMatch(sidebar, /Developer Tools/);
});

test("developer tools route path is canonical", () => {
  assert.ok(
    fs.existsSync(
      path.join(
        root,
        "src/app/(portal)/projects/[slug]/data-engines/[engineId]/developer-tools/page.tsx",
      ),
    ),
  );
});
