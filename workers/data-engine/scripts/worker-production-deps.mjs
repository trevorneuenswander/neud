#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const workerRoot = path.resolve(__dirname, "..");
export const repoRoot = path.resolve(workerRoot, "..", "..");
export const defaultStagingWorkerRoot = path.join(repoRoot, "desktop", "staging", "worker");

export const PACKAGED_WORKER_EXCLUDED_PACKAGES = new Set(["@supabase/supabase-js"]);
export const DEV_ONLY_PACKAGES = new Set(["dotenv", "dotenv/config"]);

const IMPORT_RE =
  /(?:^\s*import\s+(?:[\w*{}\s,$]+\s+from\s+)?["']([^"']+)["']|import\(["']([^"']+)["']|require\(["']([^"']+)["']\))/gm;

const NODE_BUILTINS = new Set([
  "assert",
  "buffer",
  "child_process",
  "crypto",
  "fs",
  "http",
  "https",
  "module",
  "net",
  "os",
  "path",
  "process",
  "stream",
  "url",
  "util",
  "worker_threads",
  "zlib",
]);

export function parsePackageName(specifier) {
  if (specifier.startsWith("@")) {
    const parts = specifier.split("/");
    return parts.slice(0, 2).join("/");
  }
  return specifier.split("/")[0];
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function resolvePackageDirectory(requireFn, packageName) {
  try {
    return path.dirname(requireFn.resolve(`${packageName}/package.json`));
  } catch {
    const resolvedEntry = requireFn.resolve(packageName);
    let currentDir = path.dirname(resolvedEntry);
    while (currentDir && currentDir !== path.dirname(currentDir)) {
      const packageJsonPath = path.join(currentDir, "package.json");
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = readJson(packageJsonPath);
        if (packageJson.name === packageName) {
          return currentDir;
        }
      }
      currentDir = path.dirname(currentDir);
    }
    throw new Error(`Cannot resolve package directory for ${packageName}`);
  }
}

export function collectProductionDependencyTree(options = {}) {
  const {
    workerDir = workerRoot,
    entryRelativePath = "dist-local/index.js",
    excludePackages = PACKAGED_WORKER_EXCLUDED_PACKAGES,
  } = options;

  const entryPath = path.join(workerDir, entryRelativePath);
  if (!fs.existsSync(entryPath)) {
    throw new Error(`Missing worker entry for dependency resolution: ${entryPath}`);
  }

  const workerPackageJson = readJson(path.join(workerDir, "package.json"));
  const requireFn = createRequire(entryPath);
  const queue = Object.keys(workerPackageJson.dependencies ?? {}).filter(
    (name) => !excludePackages.has(name),
  );
  const collected = new Map();

  while (queue.length > 0) {
    const packageName = queue.shift();
    if (collected.has(packageName) || excludePackages.has(packageName)) {
      continue;
    }

    const packageDir = resolvePackageDirectory(requireFn, packageName);
    const packageJson = readJson(path.join(packageDir, "package.json"));
    collected.set(packageName, {
      name: packageName,
      version: packageJson.version,
      sourcePath: packageDir,
    });

    for (const dependencyName of Object.keys({
      ...(packageJson.dependencies ?? {}),
      ...(packageJson.optionalDependencies ?? {}),
    })) {
      queue.push(dependencyName);
    }
  }

  return collected;
}

export function packageInstallPath(modulesRoot, packageName) {
  if (packageName.startsWith("@")) {
    const [scope, name] = packageName.split("/");
    return path.join(modulesRoot, scope, name);
  }
  return path.join(modulesRoot, packageName);
}

export function copyPackageDirectory(sourceDir, targetDir) {
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }

  fs.cpSync(sourceDir, targetDir, {
    recursive: true,
    filter: (sourcePath) => !sourcePath.split(path.sep).includes(".cache"),
  });
}

export function stageWorkerProductionNodeModules(options = {}) {
  const {
    workerDir = workerRoot,
    stagingWorkerRoot = defaultStagingWorkerRoot,
    entryRelativePath = "dist-local/index.js",
    excludePackages = PACKAGED_WORKER_EXCLUDED_PACKAGES,
  } = options;

  const dependencyTree = collectProductionDependencyTree({
    workerDir,
    entryRelativePath,
    excludePackages,
  });
  const modulesRoot = path.join(stagingWorkerRoot, "node_modules");
  fs.mkdirSync(modulesRoot, { recursive: true });

  for (const packageInfo of dependencyTree.values()) {
    const targetDir = packageInstallPath(modulesRoot, packageInfo.name);
    copyPackageDirectory(packageInfo.sourcePath, targetDir);
  }

  return {
    modulesRoot,
    packageCount: dependencyTree.size,
    packages: [...dependencyTree.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
  };
}

export function listJsFiles(root) {
  const files = [];
  if (!fs.existsSync(root)) {
    return files;
  }

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listJsFiles(fullPath));
      continue;
    }
    if (entry.name.endsWith(".js")) {
      files.push(fullPath);
    }
  }

  return files;
}

export function collectExternalImports(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const imports = new Set();

  for (const match of source.matchAll(IMPORT_RE)) {
    const specifier = match[1] ?? match[2] ?? match[3];
    if (!specifier || specifier.startsWith(".") || specifier.startsWith("node:")) {
      continue;
    }

    const packageName = parsePackageName(specifier);
    if (NODE_BUILTINS.has(packageName)) {
      continue;
    }
    imports.add(packageName);
  }

  return imports;
}

function countStagedPackages(modulesRoot) {
  if (!fs.existsSync(modulesRoot)) {
    return 0;
  }

  let count = 0;
  for (const entry of fs.readdirSync(modulesRoot, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) {
      continue;
    }
    if (entry.name.startsWith("@")) {
      for (const scopedEntry of fs.readdirSync(path.join(modulesRoot, entry.name), {
        withFileTypes: true,
      })) {
        if (scopedEntry.isDirectory()) {
          count += 1;
        }
      }
      continue;
    }
    if (entry.isDirectory()) {
      count += 1;
    }
  }
  return count;
}

export function resolveAuditRoots(options = {}) {
  const stagingWorkerRoot = options.stagingWorkerRoot ?? defaultStagingWorkerRoot;
  const fromEnv = process.env.NEUD_STAGING_WORKER_ROOT?.trim();

  if (fromEnv) {
    return {
      workerDir: workerRoot,
      stagingWorkerRoot: fromEnv,
      distRoot: path.join(fromEnv, "dist"),
      modulesRoot: path.join(fromEnv, "node_modules"),
    };
  }

  if (fs.existsSync(path.join(stagingWorkerRoot, "node_modules"))) {
    return {
      workerDir: workerRoot,
      stagingWorkerRoot,
      distRoot: path.join(stagingWorkerRoot, "dist"),
      modulesRoot: path.join(stagingWorkerRoot, "node_modules"),
    };
  }

  return {
    workerDir: workerRoot,
    stagingWorkerRoot,
    distRoot: path.join(workerRoot, "dist-local"),
    modulesRoot: path.join(workerRoot, "node_modules"),
  };
}

export function auditWorkerProductionDependencies(options = {}) {
  const auditRoots = resolveAuditRoots(options);
  const {
    workerDir,
    stagingWorkerRoot,
    distRoot,
    modulesRoot,
  } = auditRoots;

  const expectedTree = collectProductionDependencyTree({
    workerDir,
    entryRelativePath: "dist-local/index.js",
  });

  const missingPackages = [];
  const versionMismatches = [];

  for (const packageInfo of expectedTree.values()) {
    const stagedPackageJsonPath = path.join(
      packageInstallPath(modulesRoot, packageInfo.name),
      "package.json",
    );

    if (!fs.existsSync(stagedPackageJsonPath)) {
      missingPackages.push({
        package: packageInfo.name,
        expectedVersion: packageInfo.version,
        sourcePath: packageInfo.sourcePath,
      });
      continue;
    }

    const stagedVersion = readJson(stagedPackageJsonPath).version;
    if (stagedVersion !== packageInfo.version) {
      versionMismatches.push({
        package: packageInfo.name,
        expectedVersion: packageInfo.version,
        stagedVersion,
      });
    }
  }

  const runtimeImports = new Set();
  for (const filePath of listJsFiles(distRoot)) {
    for (const packageName of collectExternalImports(filePath)) {
      runtimeImports.add(packageName);
    }
  }

  const missingRuntimeImports = [...runtimeImports]
    .filter((packageName) => !DEV_ONLY_PACKAGES.has(packageName))
    .filter((packageName) => !fs.existsSync(path.join(packageInstallPath(modulesRoot, packageName), "package.json")))
    .sort();

  let unresolvedInStagedContext = [];
  const stagedEntry = path.join(distRoot, "index.js");
  if (fs.existsSync(stagedEntry) && missingPackages.length === 0) {
    const stagedRequire = createRequire(stagedEntry);
    unresolvedInStagedContext = [...expectedTree.keys()]
      .filter((packageName) => {
        try {
          resolvePackageDirectory(stagedRequire, packageName);
          return false;
        } catch {
          return true;
        }
      })
      .sort();
  }

  const ok =
    missingPackages.length === 0 &&
    versionMismatches.length === 0 &&
    missingRuntimeImports.length === 0 &&
    unresolvedInStagedContext.length === 0;

  return {
    ok,
    workerDir,
    stagingWorkerRoot,
    distRoot,
    modulesRoot,
    expectedPackageCount: expectedTree.size,
    stagedPackageCount: countStagedPackages(modulesRoot),
    missingPackages,
    versionMismatches,
    missingRuntimeImports,
    unresolvedInStagedContext,
    expectedPackages: [...expectedTree.values()]
      .map((entry) => `${entry.name}@${entry.version}`)
      .sort(),
  };
}
