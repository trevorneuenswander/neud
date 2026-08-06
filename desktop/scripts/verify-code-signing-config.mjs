#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRE_SIGNING_ENV = "NEUD_REQUIRE_CODE_SIGNING";
const requireSigning = process.env[REQUIRE_SIGNING_ENV] === "1";

if (requireSigning) {
  const missing = [];
  if (!process.env.CSC_LINK?.trim()) {
    missing.push("CSC_LINK");
  }
  if (!process.env.CSC_KEY_PASSWORD?.trim()) {
    missing.push("CSC_KEY_PASSWORD");
  }
  if (missing.length > 0) {
    console.error(
      `${REQUIRE_SIGNING_ENV}=1 but missing signing secrets: ${missing.join(", ")}`,
    );
    process.exit(1);
  }
  console.log("Windows code signing credentials are configured.");
} else {
  console.log(`${REQUIRE_SIGNING_ENV} is not set; unsigned local builds are allowed.`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      requireSigning,
      script: path.basename(fileURLToPath(import.meta.url)),
    },
    null,
    2,
  ),
);
