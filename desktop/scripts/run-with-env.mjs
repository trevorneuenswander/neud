#!/usr/bin/env node
/**
 * Cross-platform env prefix for npm scripts (Windows cmd cannot use KEY=value cmd).
 *
 * Usage:
 *   node desktop/scripts/run-with-env.mjs KEY=value OTHER=1 -- npm run build:desktop
 */
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const sep = args.indexOf("--");
if (sep < 0 || sep === args.length - 1) {
  console.error("Usage: node run-with-env.mjs KEY=value ... -- <command> [args...]");
  process.exit(1);
}

const envAssignments = args.slice(0, sep);
const command = args[sep + 1];
const commandArgs = args.slice(sep + 2);
const env = { ...process.env };

for (const assignment of envAssignments) {
  const eq = assignment.indexOf("=");
  if (eq <= 0) {
    console.error(`Invalid env assignment: ${assignment}`);
    process.exit(1);
  }
  const key = assignment.slice(0, eq);
  const value = assignment.slice(eq + 1);
  // Do not clobber vars already provided by CI/workflow (e.g. NEUD_DEV_BUILD_ID).
  if (env[key] === undefined || env[key] === "") {
    env[key] = value;
  }
}

const result = spawnSync(command, commandArgs, {
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
