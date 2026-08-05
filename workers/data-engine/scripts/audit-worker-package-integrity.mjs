#!/usr/bin/env node
import { auditWorkerProductionDependencies } from "./worker-production-deps.mjs";

const report = auditWorkerProductionDependencies();
console.log(JSON.stringify(report, null, 2));
if (!report.ok) {
  process.exit(1);
}
