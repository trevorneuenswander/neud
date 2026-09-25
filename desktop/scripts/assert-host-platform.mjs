#!/usr/bin/env node
const expected = process.argv[2];
if (!expected) {
  console.error("Usage: assert-host-platform.mjs <darwin|win32>");
  process.exit(1);
}

if (process.platform !== expected) {
  console.error(
    `This packaging step requires host platform ${expected}, but current platform is ${process.platform}.`,
  );
  process.exit(1);
}
