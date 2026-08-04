import {
  ALLOWED_SCRAPER_DEPENDENCIES,
  MAX_SCRAPER_SOURCE_BYTES,
  PROHIBITED_SCRAPER_IMPORTS,
} from "../developer-tools/constants-shared";
import type { ValidationIssue, ValidationResult } from "../developer-tools/types-shared";

export function validateScraperSource(source: string): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!source.trim()) {
    issues.push({ severity: "error", message: "Scraper source cannot be empty." });
    return finalize(issues);
  }

  if (Buffer.byteLength(source, "utf8") > MAX_SCRAPER_SOURCE_BYTES) {
    issues.push({
      severity: "error",
      message: `Scraper source exceeds ${MAX_SCRAPER_SOURCE_BYTES} bytes.`,
    });
  }

  if (/\brequire\s*\(/.test(source)) {
    issues.push({
      severity: "error",
      message:
        "CommonJS require() is not supported by the ESM scraper runtime. Use an approved ESM import or injected runtime capability.",
    });
  }

  if (/\bmodule\.exports\b/.test(source) || /\bexports\.[A-Za-z_$]/.test(source)) {
    issues.push({
      severity: "error",
      message:
        "CommonJS module.exports is not supported. Export createScraper from an ES module instead.",
    });
  }

  try {
    // Syntax-only parse check for JavaScript module source.
    // eslint-disable-next-line no-new-func
    new Function(source);
  } catch (error) {
    issues.push({
      severity: "error",
      message:
        error instanceof Error ? error.message : "Scraper source has syntax errors.",
    });
  }

  if (!source.includes("createScraper")) {
    issues.push({
      severity: "error",
      message: "Scraper source must export createScraper(context).",
    });
  }

  for (const prohibited of PROHIBITED_SCRAPER_IMPORTS) {
    const pattern = new RegExp(
      `(?:import\\s.+from\\s+['"]${escapeRegExp(prohibited)}['"]|require\\(['"]${escapeRegExp(prohibited)}['"]\\))`,
    );
    if (pattern.test(source)) {
      issues.push({
        severity: "error",
        message: `Prohibited import detected: ${prohibited}`,
      });
    }
  }

  for (const allowed of ALLOWED_SCRAPER_DEPENDENCIES) {
    if (source.includes(allowed)) {
      continue;
    }
  }

  if (!/start\s*\(\s*\)/.test(source) || !/runOnce\s*\(\s*\)/.test(source)) {
    issues.push({
      severity: "warning",
      message: "Scraper should implement start(), stop(), runOnce(), and dispose().",
    });
  }

  return finalize(issues);
}

function finalize(issues: ValidationIssue[]): ValidationResult {
  const hasError = issues.some((issue) => issue.severity === "error");
  return {
    ok: !hasError,
    status: hasError ? "invalid" : "valid",
    issues,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
