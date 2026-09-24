import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readSrc(relativePath));
}

function createVersionApi() {
  const BUILD_APP_VERSION = "0.2.0";

  function stripChannelSuffix(version, channel) {
    const pattern = new RegExp(`[-.]?${channel}.*$`, "i");
    return version.replace(pattern, "").trim();
  }

  function formatDisplayVersionForChannel(version, channel) {
    const baseVersion = version.replace(/[-.](alpha|beta).*$/i, "").trim();

    if (channel === "alpha") {
      return `Alpha ${baseVersion}`;
    }

    if (channel === "beta") {
      return `Beta ${baseVersion}`;
    }

    return `v${baseVersion}`;
  }

  function resolveAppVersionInfo(rawVersion) {
    const trimmed = rawVersion.trim() || BUILD_APP_VERSION;
    const lower = trimmed.toLowerCase();

    if (lower.includes("alpha")) {
      const version = stripChannelSuffix(trimmed, "alpha") || trimmed;
      return {
        version,
        channel: "alpha",
        displayVersion: formatDisplayVersionForChannel(version, "alpha"),
      };
    }

    if (lower.includes("beta")) {
      const version = stripChannelSuffix(trimmed, "beta") || trimmed;
      return {
        version,
        channel: "beta",
        displayVersion: formatDisplayVersionForChannel(version, "beta"),
      };
    }

    if (/^0\./.test(trimmed)) {
      return {
        version: trimmed,
        channel: "alpha",
        displayVersion: formatDisplayVersionForChannel(trimmed, "alpha"),
      };
    }

    return {
      version: trimmed,
      channel: "stable",
      displayVersion: formatDisplayVersionForChannel(trimmed, "stable"),
    };
  }

  function getDisplayVersion(version) {
    const trimmed = version.trim();
    if (!trimmed) {
      return getDisplayVersion(BUILD_APP_VERSION);
    }

    return resolveAppVersionInfo(trimmed).displayVersion;
  }

  return { getDisplayVersion, BUILD_APP_VERSION };
}

const versionApi = createVersionApi();

test("0.2.0 formats as Alpha 0.2.0", () => {
  assert.equal(versionApi.getDisplayVersion("0.2.0"), "Alpha 0.2.0");
});

test("alpha suffix does not duplicate Alpha prefix", () => {
  assert.equal(versionApi.getDisplayVersion("0.1.1-alpha"), "Alpha 0.1.1");
  assert.ok(!versionApi.getDisplayVersion("0.1.1-alpha").toLowerCase().includes("alpha alpha"));
});

test("missing runtime data does not render Alpha undefined", () => {
  assert.equal(versionApi.getDisplayVersion(""), "Alpha 0.2.0");
  assert.equal(versionApi.getDisplayVersion("   "), "Alpha 0.2.0");
  assert.ok(!versionApi.getDisplayVersion("").includes("undefined"));
  assert.ok(!versionApi.getDisplayVersion("").includes("null"));
});

test("0.1.4 still formats as Alpha 0.1.4 (latest published baseline)", () => {
  assert.equal(versionApi.getDisplayVersion("0.1.4"), "Alpha 0.1.4");
});

test("canonical package metadata stays at 0.2.0 in root and desktop packages", () => {
  const rootPkg = readJson("package.json");
  const desktopPkg = readJson("desktop/package.json");

  assert.equal(rootPkg.version, "0.2.0");
  assert.equal(desktopPkg.version, "0.2.0");
  assert.equal(rootPkg.version, desktopPkg.version);
});

test("renderer build config sources version from root package metadata", () => {
  const config = readSrc("next.config.ts");
  assert.match(config, /readFileSync\(path\.join\(__dirname, "package\.json"\)/);
  assert.match(config, /NEXT_PUBLIC_NEUD_APP_VERSION: packageJson\.version/);
});

test("sidebar uses shared AppVersion instead of hardcoded release label", () => {
  const branding = readSrc("src/components/portal/SidebarBranding.tsx");
  const appVersion = readSrc("src/components/branding/AppVersion.tsx");

  assert.match(branding, /<AppVersion placement="sidebar" \/>/);
  assert.doesNotMatch(branding, /Alpha 0\.1\.0/);
  assert.doesNotMatch(branding, /"Alpha /);
  assert.match(appVersion, /useAppVersion/);
  assert.match(readSrc("src/lib/version/use-app-version.ts"), /getBuildAppVersionLabel/);
});

test("login and marketing pages reuse shared AppVersion beneath NEUD branding", () => {
  const marketing = readSrc("src/components/marketing/MarketingHomePage.tsx");
  const desktopLogin = readSrc("src/components/auth/DesktopLoginPage.tsx");
  const hostedLogin = readSrc("src/app/(public)/login/page.tsx");
  assert.match(marketing, /<AppVersion placement="hero" \/>/);
  assert.match(desktopLogin, /<AppVersion placement="hero" \/>/);
  assert.match(hostedLogin, /showTagline/);
  assert.doesNotMatch(marketing, /Alpha 0\.1\.0/);
});

test("packaged Electron runtime exposes canonical version through neud bridge", () => {
  const preload = readSrc("desktop/src/preload.ts");
  const appIpc = readSrc("desktop/src/ipc/app.ts");
  const releaseVersion = readSrc("desktop/src/app/release-version.ts");

  assert.match(preload, /neud:app:getVersion/);
  assert.match(preload, /exposeInMainWorld\("neudDesktop"/);
  assert.match(appIpc, /getCanonicalReleaseVersion\(\)/);
  assert.match(releaseVersion, /syncElectronReleaseVersion/);
});

test("desktop build syncs canonical release version into dist package.json", () => {
  const syncScript = readSrc("desktop/scripts/sync-release-version.mjs");
  const copyAssets = readSrc("desktop/scripts/copy-runtime-assets.mjs");

  assert.match(syncScript, /Root package\.json is the canonical NEUD release version/);
  assert.match(syncScript, /dist\/package\.json/);
  assert.match(copyAssets, /syncReleaseVersion\(\)/);
});

test("development and build scripts do not auto-bump package version", () => {
  const rootPkg = readJson("package.json");
  const desktopPkg = readJson("desktop/package.json");
  const scriptBlob = [
    ...Object.values(rootPkg.scripts ?? {}),
    ...Object.values(desktopPkg.scripts ?? {}),
  ].join("\n");

  assert.doesNotMatch(scriptBlob, /npm version/);
  assert.doesNotMatch(scriptBlob, /preversion/);
  assert.doesNotMatch(scriptBlob, /postversion/);
});

test("AppVersion keeps stable sidebar classes without shell offset changes", () => {
  const appVersion = readSrc("src/components/branding/AppVersion.tsx");
  const sidebar = readSrc("src/components/portal/Sidebar.tsx");

  assert.match(appVersion, /sidebar-version shrink-0 whitespace-nowrap/);
  assert.match(sidebar, /SidebarBranding/);
  assert.doesNotMatch(sidebar, /top-0/);
});

test("version hook resolves desktop bridge then falls back to build label", () => {
  const hook = readSrc("src/lib/version/use-app-version.ts");
  assert.match(hook, /useState\(\(\) => getBuildAppVersionLabel\(\)\)/);
  assert.match(hook, /isDesktopEnvironment\(\)/);
  assert.match(hook, /desktop\.app[\s\S]*\.getVersion\(\)/);
  assert.match(hook, /getDisplayVersion\(version\)/);
  assert.doesNotMatch(hook, /router\.refresh/);
});

test("release versioning policy is documented", () => {
  const doc = readSrc("docs/release-versioning.md");
  const milestones = readSrc("docs/release-milestones.md");
  const githubRelease = readSrc("docs/github-release.md");
  assert.match(doc, /Alpha MAJOR\.MINOR\.PATCH/);
  assert.match(doc, /package\.json/);
  assert.match(doc, /getCanonicalReleaseVersion\(\)/);
  assert.match(doc, /Do not add automatic version bumps/);
  assert.match(doc, /Latest published release.*v0\.1\.4/);
  assert.match(milestones, /Current release candidate.*v0\.2\.0/);
  assert.match(milestones, /v0\.1\.4 → v0\.2\.0/);
  assert.match(milestones, /v0\.3\.0.*LAN-accessible/);
  assert.match(milestones, /v0\.4\.0.*modular project packages/);
  assert.doesNotMatch(milestones, /LAN-accessible[\s\S]*ships in v0\.2\.0/i);
  assert.match(githubRelease, /NEUD-Setup-latest-x64\.exe/);
});

test("authoritative package versions are not 0.1.5", () => {
  const rootPkg = readJson("package.json");
  const desktopPkg = readJson("desktop/package.json");
  assert.notEqual(rootPkg.version, "0.1.5");
  assert.notEqual(desktopPkg.version, "0.1.5");
});

test("electron-builder publish metadata matches GitHub repository", () => {
  const config = readSrc("desktop/electron-builder.yml");
  assert.match(config, /owner: trevorneuenswander/);
  assert.match(config, /repo: neud/);
  assert.match(config, /appId: com\.hildreths\.neud/);
});
