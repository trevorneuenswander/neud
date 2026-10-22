import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

/**
 * Resolve a runnable node-gyp entry for Electron native rebuilds.
 * Prefer local desktop/.bin, then workspace root, then node-gyp package bin.
 */
export function resolveNodeGyp(desktopRoot) {
  const require = createRequire(path.join(desktopRoot, "package.json"));
  const binName = process.platform === "win32" ? "node-gyp.cmd" : "node-gyp";
  const candidates = [
    path.join(desktopRoot, "node_modules", ".bin", binName),
    path.join(desktopRoot, "..", "node_modules", ".bin", binName),
  ];

  try {
    const pkgDir = path.dirname(require.resolve("node-gyp/package.json"));
    candidates.push(path.join(pkgDir, "bin", "node-gyp.js"));
  } catch {
    // ignore — fall through to path candidates
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // Last resort: rely on PATH (npx / global).
  return binName;
}

export function nodeGypSpawnOptions(nodeGypPath) {
  const isJs = nodeGypPath.endsWith(".js");
  const isWinCmd = process.platform === "win32" && nodeGypPath.endsWith(".cmd");
  return {
    command: isJs ? process.execPath : nodeGypPath,
    argsPrefix: isJs ? [nodeGypPath] : [],
    // Windows .cmd shims require a shell; JS entry does not.
    shell: isWinCmd,
  };
}
