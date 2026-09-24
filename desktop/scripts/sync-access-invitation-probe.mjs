#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = path.join(repoRoot, "shared", "access-management", "access-invitation-probe.ts");
const target = path.join(repoRoot, "desktop", "src", "services", "access-invitation-probe.ts");
const contents = `/** Synced from shared/access-management/access-invitation-probe.ts */\n${fs.readFileSync(source, "utf8")}`;
fs.writeFileSync(target, contents, "utf8");
