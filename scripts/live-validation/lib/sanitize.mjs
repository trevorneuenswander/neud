const SECRET_PATTERNS = [
  /postgres(?:ql)?:\/\/[^\s"'`]+/gi,
  /NEUD_SUPABASE_DB_URL\s*=\s*\S+/gi,
  /SUPABASE_SERVICE_ROLE_KEY\s*=\s*\S+/gi,
  /password[=:]\s*[^\s&"']+/gi,
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
];

const MULTILINE_AUDIT_FIELDS = new Set([
  "definition",
  "register_function_definition",
  "qual",
  "with_check",
]);

export function sanitizeText(value) {
  let text = value instanceof Error ? value.message : String(value);
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, "[REDACTED]");
  }
  return text;
}

export function sanitizeError(error) {
  if (!error) {
    return { message: "unknown error" };
  }

  return {
    message: sanitizeText(error),
    code: error.code ?? undefined,
    detail: error.detail ? sanitizeText(error.detail) : undefined,
    hint: error.hint ? sanitizeText(error.hint) : undefined,
  };
}

function formatMultilineAuditField(value) {
  const sanitized = sanitizeText(value);
  return {
    value: sanitized,
    lines: sanitized.split(/\r?\n/),
  };
}

export function sanitizeAuditRows(rows) {
  return rows.map((row) => {
    const sanitized = {};
    for (const [key, value] of Object.entries(row)) {
      if (typeof value === "string" && MULTILINE_AUDIT_FIELDS.has(key)) {
        const formatted = formatMultilineAuditField(value);
        sanitized[key] = formatted.value;
        sanitized[`${key}_lines`] = formatted.lines;
      } else if (typeof value === "string") {
        sanitized[key] = sanitizeText(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  });
}

export function extractAuditDefinitions(sections) {
  const definitions = [];

  for (const section of sections) {
    if (!Array.isArray(section.rows)) {
      continue;
    }

    for (const row of section.rows) {
      if (typeof row.definition === "string") {
        definitions.push(
          `-- ${section.label}: ${row.function_name ?? "function"}\n${row.definition}\n`,
        );
      }

      if (typeof row.register_function_definition === "string") {
        definitions.push(
          `-- ${section.label}\n${row.register_function_definition}\n`,
        );
      }
    }
  }

  return definitions.join("\n");
}
