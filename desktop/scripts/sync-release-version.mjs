import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(desktopRoot, "..");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/**
 * Root package.json is the canonical NEUD release version.
 * Desktop package.json and dist/package.json are synchronized from it.
 */
export function syncReleaseVersion() {
  const rootPkg = readJson(path.join(repoRoot, "package.json"));
  const desktopPkgPath = path.join(desktopRoot, "package.json");
  const desktopPkg = readJson(desktopPkgPath);
  const releaseVersion = rootPkg.version;

  if (!releaseVersion || typeof releaseVersion !== "string") {
    throw new Error("Root package.json is missing a string version field.");
  }

  if (desktopPkg.version !== releaseVersion) {
    desktopPkg.version = releaseVersion;
    writeJson(desktopPkgPath, desktopPkg);
    console.log(
      `Synchronized @neud/desktop package.json version to ${releaseVersion}`,
    );
  }

  if (!desktopPkg.scripts?.build || !desktopPkg.devDependencies?.electron) {
    throw new Error(
      "desktop/package.json is missing required scripts or devDependencies. Restore the workspace package.json before syncing release version.",
    );
  }

  const distDir = path.join(desktopRoot, "dist");
  fs.mkdirSync(distDir, { recursive: true });

  const distPackage = {
    name: desktopPkg.name,
    version: releaseVersion,
    main: "bootstrap.js",
    private: true,
  };

  writeJson(path.join(distDir, "package.json"), distPackage);
  console.log(`Wrote dist/package.json with release version ${releaseVersion}`);

  return releaseVersion;
}
