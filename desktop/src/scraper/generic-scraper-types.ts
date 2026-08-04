export const GENERIC_EXTRACTION_TYPES = ["text", "html", "attribute"] as const;

export type GenericExtractionType = (typeof GENERIC_EXTRACTION_TYPES)[number];

export type GenericLoginConfig = {
  usernameSelector: string;
  passwordSelector: string;
  submitSelector: string;
  successSelector?: string;
  successUrlContains?: string;
};

export type GenericExtractionField = {
  key: string;
  label: string;
  selector: string;
  extraction: GenericExtractionType;
  attribute?: string;
};

export type GenericScraperEngineConfig = {
  login?: GenericLoginConfig;
  fields?: GenericExtractionField[];
};

export const GENERIC_PAGE_SOURCE_KEY = "page";
export const GENERIC_LOGIN_SOURCE_KEY = "login";

export type GenericFieldSnapshot = {
  value: string | null;
  found: boolean;
  selector: string;
  extraction: GenericExtractionType;
  error?: string;
};

export type GenericWebpageSnapshot = {
  schemaVersion: 1;
  adapter: "generic-webpage";
  sourceUrl: string;
  capturedAt: string;
  page: {
    title?: string;
    finalUrl: string;
  };
  values: Record<string, GenericFieldSnapshot>;
};

export function isGenericWebpageSnapshot(
  data: Record<string, unknown> | null | undefined,
): data is GenericWebpageSnapshot {
  return (
    data?.adapter === "generic-webpage" &&
    data?.schemaVersion === 1 &&
    typeof data.sourceUrl === "string"
  );
}
