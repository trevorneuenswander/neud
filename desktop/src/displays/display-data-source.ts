export type DisplayDataSource = "webpage-scraper" | "local-controller";

export const DISPLAY_DATA_SOURCE_SETTING_KEY = "displayDataSource";

export const DISPLAY_DATA_SOURCE_OPTIONS: Array<{
  value: DisplayDataSource;
  label: string;
}> = [
  { value: "webpage-scraper", label: "Webpage Scraper" },
  { value: "local-controller", label: "Local Controller" },
];

export function isDisplayDataSource(value: unknown): value is DisplayDataSource {
  return value === "webpage-scraper" || value === "local-controller";
}

const LEGACY_DISPLAY_DATA_SOURCE_MAP: Record<string, DisplayDataSource> = {
  manual: "local-controller",
  automatic: "webpage-scraper",
  scraper: "webpage-scraper",
  controller: "local-controller",
};

export function normalizeDisplayDataSource(value: unknown): DisplayDataSource {
  if (isDisplayDataSource(value)) {
    return value;
  }
  if (typeof value === "string") {
    const mapped = LEGACY_DISPLAY_DATA_SOURCE_MAP[value.trim().toLowerCase()];
    if (mapped) {
      return mapped;
    }
  }
  return "webpage-scraper";
}

export function displayDataSourceLabel(source: DisplayDataSource): string {
  return (
    DISPLAY_DATA_SOURCE_OPTIONS.find((option) => option.value === source)?.label ??
    source
  );
}
