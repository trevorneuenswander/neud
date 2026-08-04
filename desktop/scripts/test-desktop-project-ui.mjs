import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

function readSrc(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("project overview includes activity panel with scrollable body", () => {
  const overview = readSrc("src/components/projects/ProjectOverview.tsx");
  const activityPanel = readSrc("src/components/projects/ProjectActivityPanel.tsx");

  assert.ok(overview.includes("ProjectActivityPanel"));
  assert.ok(activityPanel.includes("Activity"));
  assert.ok(activityPanel.includes("overflow-y-auto"));
  assert.ok(activityPanel.includes("No activity recorded"));
});

test("settings danger zone heading and subtitle are removed", () => {
  const settingsPage = readSrc("src/app/(portal)/projects/[slug]/settings/page.tsx");

  assert.ok(!settingsPage.includes("Danger Zone"));
  assert.ok(!settingsPage.includes("Destructive actions for this project"));
  assert.ok(settingsPage.includes("DeleteProjectSection"));
  assert.ok(settingsPage.includes("ProjectSettingsForm"));
  assert.ok(settingsPage.includes("requireProjectSettingsAccess"));
  assert.ok(settingsPage.includes("border-danger/40"));
});

test("project nav hides settings for non-admin roles", () => {
  const nav = readSrc("src/components/projects/ProjectNav.tsx");
  const layoutFrame = readSrc("src/components/projects/ProjectLayoutFrame.tsx");
  const layout = readSrc("src/app/(portal)/projects/[slug]/layout.tsx");

  assert.ok(nav.includes("canManageSettings"));
  assert.ok(nav.includes("settingsOnly"));
  assert.ok(layoutFrame.includes("canManageSettings"));
  assert.ok(layout.includes("canManageSettings={access.canManageSettings}"));
});

test("url configuration uses developer tools disclosure section", () => {
  const form = readSrc(
    "src/components/data-engines/webpage-scraper/BroadArrowConfigurationForm.tsx",
  );
  const disclosure = readSrc("src/components/ui/DisclosureSection.tsx");
  const developerTools = readSrc(
    "src/components/data-engines/webpage-scraper/DeveloperDrawer.tsx",
  );

  assert.ok(form.includes("DisclosureSection"));
  assert.ok(form.includes('title="URL Configuration"'));
  assert.ok(disclosure.includes("aria-expanded"));
  assert.ok(disclosure.includes("aria-controls"));
  assert.ok(disclosure.includes("duration-200"));
  assert.ok(disclosure.includes("grid-rows-[0fr]"));
  assert.ok(developerTools.includes("DisclosureSection"));
});

test("advanced settings uses developer tools disclosure section", () => {
  const settingsForm = readSrc(
    "src/components/data-engines/webpage-scraper/EngineSettingsForm.tsx",
  );
  const disclosure = readSrc("src/components/ui/DisclosureSection.tsx");

  assert.ok(settingsForm.includes('title="Advanced settings"'));
  assert.ok(settingsForm.includes("DisclosureSection"));
  assert.ok(disclosure.includes("aria-expanded"));
  assert.ok(disclosure.includes("grid-rows-[1fr]"));
  assert.ok(!settingsForm.includes("Hide"));
  assert.ok(!settingsForm.includes("Show"));
});

test("project metadata uses developer tools disclosure section", () => {
  const overview = readSrc("src/components/projects/ProjectOverview.tsx");
  const disclosure = readSrc("src/components/ui/DisclosureSection.tsx");

  assert.ok(overview.includes('title="Project metadata"'));
  assert.ok(overview.includes("DisclosureSection"));
  assert.ok(disclosure.includes("rotate-90"));
});

test("developer tools drawer label matches scraper page order", () => {
  const drawer = readSrc("src/components/data-engines/webpage-scraper/DeveloperDrawer.tsx");
  const detail = readSrc("src/components/data-engines/EngineDetailClient.tsx");

  assert.ok(drawer.includes("Developer Tools"));
  assert.ok(drawer.includes("DisclosureSection"));
  assert.ok(detail.includes("BroadArrowConfigurationForm"));
  assert.ok(detail.indexOf("BroadArrowConfigurationForm") < detail.indexOf("DeveloperDrawer"));
});

test("overview statistics cards match requested layout", () => {
  const stats = readSrc("src/components/data-engines/webpage-scraper/EngineStatistics.tsx");
  const overview = readSrc("src/components/projects/ProjectOverview.tsx");

  assert.ok(stats.includes("StatBreakdownCard"));
  assert.ok(stats.includes('title="Scrapes today"'));
  assert.ok(stats.includes('title="Total scrapes"'));
  assert.ok(stats.includes('label: "Total"'));
  assert.ok(stats.includes('label: "Successful"'));
  assert.ok(stats.includes('label: "Failed"'));
  assert.ok(!stats.includes("Successful runs"));
  assert.ok(!stats.includes("Successful today"));
  assert.ok(stats.indexOf('title="Scrapes today"') < stats.indexOf('title="Total scrapes"'));
  assert.ok(stats.includes('label="Latest JSON size"'));
  assert.ok(!stats.includes("Latest snapshot"));
  assert.ok(stats.includes('label="Last poll"'));
  assert.ok(!stats.includes("Last heartbeat"));
  assert.ok(!stats.includes("Last poll:"));
  assert.ok(stats.includes('label="Average poll rate"'));
  assert.ok(stats.includes("formatAveragePollRate"));
  assert.ok(!stats.includes("formatPollInterval(pollIntervalMs"));
  assert.ok(!stats.includes("From engine settings"));
  assert.ok(stats.includes('label="Active Displays"'));
  assert.ok(stats.includes("enabledDisplayCount"));
  assert.ok(!stats.includes('label="Displays"'));
  assert.ok(!stats.includes("displayCount"));
  assert.ok(!stats.includes('value="—"'));
});

test("overview metadata shows creator and hides removed fields", () => {
  const overview = readSrc("src/components/projects/ProjectOverview.tsx");

  assert.ok(!overview.includes('text-muted">Owner'));
  assert.ok(!overview.includes('text-muted">Icon'));
  assert.ok(!overview.includes('text-muted">Theme'));
  assert.ok(!overview.includes("Manager"));
  assert.ok(overview.includes("Creator"));
  assert.ok(overview.includes("creator.name"));
  assert.ok(overview.includes("creator.email"));
  assert.ok(overview.includes("Webpage Scraper"));
});

test("project activity route renders full activity view", () => {
  const activityPage = readSrc("src/app/(portal)/projects/[slug]/activity/page.tsx");

  assert.ok(activityPage.includes("ProjectActivityFullView"));
  assert.ok(activityPage.includes("requireProjectAccess"));
  assert.ok(!activityPage.includes("redirect("));
});
