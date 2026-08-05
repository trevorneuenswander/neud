import { logWorkerBoot } from "./lifecycle-diagnostics.js";

process.on("uncaughtException", (error) => {
  console.error("[worker:uncaughtException]", error?.stack || error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error(
    "[worker:unhandledRejection]",
    reason instanceof Error ? reason.stack : String(reason),
  );
  process.exit(1);
});

logWorkerBoot({ stage: "boot-entry" });

try {
  await import("./index.js");
} catch (error) {
  console.error("[worker:bootstrap-import]", error?.stack || error);
  process.exit(1);
}
