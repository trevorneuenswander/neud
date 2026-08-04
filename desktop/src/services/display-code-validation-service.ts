import {
  DISPLAY_SLUG_PATTERN,
  MAX_DISPLAY_SOURCE_BYTES,
  PROHIBITED_DISPLAY_PATTERNS,
  RESERVED_DISPLAY_SLUGS,
} from "../developer-tools/constants-shared";
import { buildDisplayDocument } from "../developer-tools/templates";
import type { ValidationIssue, ValidationResult } from "../developer-tools/types-shared";

export function validateDisplaySlug(slug: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const normalized = slug.trim().toLowerCase();

  if (!normalized) {
    issues.push({ severity: "error", message: "Display slug is required." });
    return issues;
  }

  if (!DISPLAY_SLUG_PATTERN.test(normalized)) {
    issues.push({
      severity: "error",
      message: "Display slug must use lowercase letters, numbers, and hyphens.",
    });
  }

  if (RESERVED_DISPLAY_SLUGS.has(normalized)) {
    issues.push({
      severity: "error",
      message: `Display slug "${normalized}" is reserved.`,
    });
  }

  return issues;
}

export function validateDisplaySource(input: {
  html: string;
  css?: string;
  javascript?: string;
  slug?: string;
}): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (input.slug) {
    issues.push(...validateDisplaySlug(input.slug));
  }

  const totalBytes = Buffer.byteLength(
    `${input.html}\n${input.css ?? ""}\n${input.javascript ?? ""}`,
    "utf8",
  );
  if (totalBytes > MAX_DISPLAY_SOURCE_BYTES) {
    issues.push({
      severity: "error",
      message: `Display source exceeds ${MAX_DISPLAY_SOURCE_BYTES} bytes.`,
    });
  }

  if (!input.html.trim()) {
    issues.push({ severity: "error", message: "Display HTML is required." });
  }

  for (const pattern of PROHIBITED_DISPLAY_PATTERNS) {
    const haystack = `${input.css ?? ""}\n${input.javascript ?? ""}`;
    if (pattern.test(haystack)) {
      issues.push({
        severity: "error",
        message: `Prohibited API usage detected: ${pattern.source}`,
      });
    }
  }

  if (
    !/^<!doctype html/i.test(input.html.trim()) &&
    !/^<html[\s>]/i.test(input.html.trim())
  ) {
    try {
      buildDisplayDocument({
        html: input.html,
        css: input.css,
        javascript: input.javascript,
      });
    } catch (error) {
      issues.push({
        severity: "error",
        message:
          error instanceof Error
            ? error.message
            : "Display document could not be assembled.",
      });
    }
  } else if (!/<html[\s>]/i.test(input.html)) {
    issues.push({
      severity: "error",
      message: "Standalone HTML must include an html element.",
    });
  }

  if (input.javascript?.trim()) {
    try {
      // eslint-disable-next-line no-new-func
      new Function(input.javascript);
    } catch (error) {
      issues.push({
        severity: "error",
        message:
          error instanceof Error
            ? `JavaScript syntax error: ${error.message}`
            : "Display JavaScript has syntax errors.",
      });
    }
  }

  const hasError = issues.some((issue) => issue.severity === "error");
  return {
    ok: !hasError,
    status: hasError ? "invalid" : "valid",
    issues,
  };
}
