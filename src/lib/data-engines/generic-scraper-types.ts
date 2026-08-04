export type GenericExtractionType = "text" | "html" | "attribute";

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

export const ADAPTER_LABELS = {
  "bag-auction": "BAG Auction",
  "generic-webpage": "Generic Webpage Scraper",
} as const;
