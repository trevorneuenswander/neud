import {
  CREATABLE_PROJECT_DATA_TYPES,
  DEFAULT_PROJECT_ICON,
  DEFAULT_PROJECT_THEME,
  MAX_LOGO_URL_LENGTH,
  MAX_PROJECT_DESCRIPTION_LENGTH,
  MAX_PROJECT_ICON_LENGTH,
  MAX_PROJECT_NAME_LENGTH,
  MAX_PROJECT_THEME_LENGTH,
  PROJECT_ACCESS_LEVELS,
  type CreatableProjectDataType,
  type ProjectAccessLevel,
} from "@/lib/projects/constants";
import { isValidHexColor } from "@/lib/projects/format";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function validateProjectName(name: string): string | null {
  const trimmed = name.trim();

  if (!trimmed) {
    return "Project name is required.";
  }

  if (trimmed.length > MAX_PROJECT_NAME_LENGTH) {
    return `Project name must be ${MAX_PROJECT_NAME_LENGTH} characters or fewer.`;
  }

  return null;
}

export function validateProjectDescription(description: string): string | null {
  const trimmed = description.trim();

  if (trimmed.length > MAX_PROJECT_DESCRIPTION_LENGTH) {
    return `Description must be ${MAX_PROJECT_DESCRIPTION_LENGTH} characters or fewer.`;
  }

  return null;
}

export function validateCreatableProjectDataType(
  dataType: string,
): CreatableProjectDataType | null {
  const trimmed = dataType.trim();

  if (!trimmed) {
    return null;
  }

  if (CREATABLE_PROJECT_DATA_TYPES.includes(trimmed as CreatableProjectDataType)) {
    return trimmed as CreatableProjectDataType;
  }

  return null;
}

export function validateOptionalHexColor(
  value: string,
  label: string,
): string | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (!isValidHexColor(trimmed)) {
    return `${label} must be a valid hex color such as #1A2B3C.`;
  }

  return null;
}

export function validateOptionalUrl(value: string, label: string): string | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.length > MAX_LOGO_URL_LENGTH) {
    return `${label} must be ${MAX_LOGO_URL_LENGTH} characters or fewer.`;
  }

  try {
    const parsed = new URL(trimmed);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return `${label} must use http or https.`;
    }
  } catch {
    return `${label} must be a valid URL.`;
  }

  return null;
}

export function validateProjectTheme(theme: string): string | null {
  const trimmed = theme.trim() || DEFAULT_PROJECT_THEME;

  if (trimmed.length > MAX_PROJECT_THEME_LENGTH) {
    return `Theme must be ${MAX_PROJECT_THEME_LENGTH} characters or fewer.`;
  }

  return null;
}

export function validateProjectIcon(icon: string): string | null {
  const trimmed = icon.trim() || DEFAULT_PROJECT_ICON;

  if (trimmed.length > MAX_PROJECT_ICON_LENGTH) {
    return `Icon must be ${MAX_PROJECT_ICON_LENGTH} characters or fewer.`;
  }

  return null;
}

export function validateProjectAccessLevel(
  accessLevel: string,
): ProjectAccessLevel | null {
  if (PROJECT_ACCESS_LEVELS.includes(accessLevel as ProjectAccessLevel)) {
    return accessLevel as ProjectAccessLevel;
  }

  return null;
}

export function generateSlugFromName(name: string): string {
  const normalized = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.slice(0, 120);
}

export function appendSlugSuffix(baseSlug: string, suffix: number): string {
  const suffixText = `-${suffix}`;
  const maxBaseLength = 120 - suffixText.length;
  const trimmedBase = baseSlug.slice(0, Math.max(maxBaseLength, 1));

  return `${trimmedBase}${suffixText}`;
}
