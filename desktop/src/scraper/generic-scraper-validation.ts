import { isValidScraperSourceUrl } from "../bag/default-sources";
import {
  GENERIC_EXTRACTION_TYPES,
  type GenericExtractionField,
  type GenericLoginConfig,
  type GenericScraperEngineConfig,
} from "./generic-scraper-types";
import {
  isKnownScraperAdapter,
  SCRAPER_ADAPTERS,
  validateAdapterCompatibility,
} from "./adapters";

export type GenericValidationResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

const KEY_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;

function parseEngineGenericConfig(
  config: Record<string, unknown>,
): GenericScraperEngineConfig {
  const loginRaw = config.login;
  const fieldsRaw = config.fields;

  const login =
    loginRaw && typeof loginRaw === "object" && !Array.isArray(loginRaw)
      ? (loginRaw as GenericLoginConfig)
      : undefined;

  const fields = Array.isArray(fieldsRaw)
    ? (fieldsRaw as GenericExtractionField[])
    : [];

  return { login, fields };
}

export function validateGenericField(
  field: GenericExtractionField,
  index: number,
): GenericValidationResult {
  const prefix = `Extraction field ${index + 1}`;

  if (!field || typeof field !== "object") {
    return {
      ok: false,
      code: "invalid-field",
      message: `${prefix} is invalid.`,
    };
  }

  const key = typeof field.key === "string" ? field.key.trim() : "";
  if (!KEY_PATTERN.test(key)) {
    return {
      ok: false,
      code: "invalid-field-key",
      message: `${prefix} needs a valid key (lowercase letters, numbers, hyphens, underscores).`,
    };
  }

  const selector = typeof field.selector === "string" ? field.selector.trim() : "";
  if (!selector) {
    return {
      ok: false,
      code: "missing-field-selector",
      message: `${prefix} "${key}" is missing a CSS selector.`,
    };
  }

  if (
    !GENERIC_EXTRACTION_TYPES.includes(
      field.extraction as (typeof GENERIC_EXTRACTION_TYPES)[number],
    )
  ) {
    return {
      ok: false,
      code: "invalid-extraction-type",
      message: `${prefix} "${key}" has an unsupported extraction type.`,
    };
  }

  if (field.extraction === "attribute") {
    const attribute =
      typeof field.attribute === "string" ? field.attribute.trim() : "";
    if (!attribute) {
      return {
        ok: false,
        code: "missing-attribute-name",
        message: `${prefix} "${key}" requires an attribute name for attribute extraction.`,
      };
    }
  }

  return { ok: true };
}

export function validateGenericFields(
  fields: GenericExtractionField[] | undefined,
): GenericValidationResult {
  if (!fields || fields.length === 0) {
    return {
      ok: false,
      code: "missing-fields",
      message:
        "Add at least one extraction field before starting the engine.",
    };
  }

  const seenKeys = new Set<string>();
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    const fieldResult = validateGenericField(field, index);
    if (!fieldResult.ok) {
      return fieldResult;
    }

    if (seenKeys.has(field.key.trim())) {
      return {
        ok: false,
        code: "duplicate-field-key",
        message: `Duplicate extraction field key "${field.key.trim()}".`,
      };
    }
    seenKeys.add(field.key.trim());
  }

  return { ok: true };
}

export function validateGenericLoginConfig(
  login: GenericLoginConfig | undefined,
): GenericValidationResult {
  if (!login) {
    return {
      ok: false,
      code: "missing-login-selectors",
      message:
        "Login URL is configured but login selectors are missing. Add username, password, and submit selectors.",
    };
  }

  const usernameSelector =
    typeof login.usernameSelector === "string"
      ? login.usernameSelector.trim()
      : "";
  const passwordSelector =
    typeof login.passwordSelector === "string"
      ? login.passwordSelector.trim()
      : "";
  const submitSelector =
    typeof login.submitSelector === "string" ? login.submitSelector.trim() : "";

  if (!usernameSelector || !passwordSelector || !submitSelector) {
    return {
      ok: false,
      code: "missing-login-selectors",
      message:
        "Login URL is configured but login selectors are incomplete. Provide username, password, and submit selectors.",
    };
  }

  return { ok: true };
}

export function genericEngineRequiresCredentials(
  loginUrl: string | null | undefined,
  loginConfig: GenericLoginConfig | undefined,
): boolean {
  const trimmed = loginUrl?.trim();
  if (!trimmed) return false;
  return validateGenericLoginConfig(loginConfig).ok;
}

export function validateGenericScraperForStart(input: {
  projectType: string;
  adapter: unknown;
  pageUrl: string | null | undefined;
  loginUrl: string | null | undefined;
  engineConfig: Record<string, unknown>;
  hasCredentials: boolean;
}): GenericValidationResult {
  const compatibility = validateAdapterCompatibility(
    input.projectType,
    input.adapter,
  );
  if (!compatibility.ok) {
    return compatibility;
  }

  if (input.adapter !== SCRAPER_ADAPTERS.GENERIC_WEBPAGE) {
    return {
      ok: false,
      code: "wrong-adapter",
      message: "Generic validation called for a non-generic adapter.",
    };
  }

  const pageUrl = input.pageUrl?.trim() ?? "";
  if (!pageUrl) {
    return {
      ok: false,
      code: "missing-page-url",
      message:
        "Page URL is not configured. Add the webpage you want to scrape before starting the engine.",
    };
  }

  if (!isValidScraperSourceUrl(pageUrl)) {
    return {
      ok: false,
      code: "invalid-page-url",
      message: "Page URL is not a valid http or https URL.",
    };
  }

  const { login, fields } = parseEngineGenericConfig(input.engineConfig);
  const fieldsResult = validateGenericFields(fields);
  if (!fieldsResult.ok) {
    return fieldsResult;
  }

  const loginUrl = input.loginUrl?.trim() ?? "";
  if (loginUrl) {
    if (!isValidScraperSourceUrl(loginUrl)) {
      return {
        ok: false,
        code: "invalid-login-url",
        message: "Login URL is not a valid http or https URL.",
      };
    }

    const loginResult = validateGenericLoginConfig(login);
    if (!loginResult.ok) {
      return loginResult;
    }

    if (!input.hasCredentials) {
      return {
        ok: false,
        code: "missing-credentials",
        message:
          "Save scraper credentials before starting an engine with login enabled.",
      };
    }
  }

  return { ok: true };
}

export function parseGenericEngineConfig(
  config: Record<string, unknown>,
): GenericScraperEngineConfig {
  return parseEngineGenericConfig(config);
}

export function resolveAdapterFromConfig(
  config: Record<string, unknown> | null | undefined,
): string | null {
  const adapter = config?.adapter;
  return typeof adapter === "string" && adapter.trim() ? adapter.trim() : null;
}

export function assertKnownAdapter(adapter: unknown): GenericValidationResult {
  if (!isKnownScraperAdapter(adapter)) {
    return {
      ok: false,
      code: "unknown-adapter",
      message:
        typeof adapter === "string" && adapter
          ? `Unsupported scraper adapter "${adapter}".`
          : "No scraper adapter is configured.",
    };
  }
  return { ok: true };
}
