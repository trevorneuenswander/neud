/**
 * Project capability catalog (Pass 21).
 * Multi-select model — not an exclusive project.type enum.
 */

export const PROJECT_CAPABILITY_IDS = [
  "data-source",
  "webpage-scraper",
  "live-chat",
  "scoreboard",
  "timer",
  "lower-thirds",
  "display-only",
  "social-feed",
  "results-leaderboard",
  "rundown-schedule",
  "election-results",
  "weather",
  "statistics",
  "manual-controller",
  "automation-trigger",
] as const;

export type ProjectCapabilityId = (typeof PROJECT_CAPABILITY_IDS)[number];

export type ProjectCapabilityDefinition = {
  id: ProjectCapabilityId;
  label: string;
  description: string;
  /** Route segment under /projects/[slug]/…; null = no dedicated module page */
  moduleRoute: string | null;
  moduleLabel: string;
  /** true when a real workflow page already exists */
  implemented: boolean;
};

export const PROJECT_CAPABILITY_CATALOG: readonly ProjectCapabilityDefinition[] = [
  {
    id: "data-source",
    label: "Data Source",
    description:
      "Connect structured data from JSON, CSV, Google Sheets, REST/API, WebSocket, webhook-style ingestion, or manual structured data.",
    moduleRoute: "data-source",
    moduleLabel: "Data Source",
    implemented: true,
  },
  {
    id: "webpage-scraper",
    label: "Webpage Scraper",
    description:
      "Scrape or ingest data from web pages, websites, page DOM, or APIs tied to a scraper workflow.",
    moduleRoute: "data-engines",
    moduleLabel: "Webpage Scraper",
    implemented: true,
  },
  {
    id: "live-chat",
    label: "Live Chat",
    description:
      "Live messages from services such as Zoom, YouTube Live, Facebook Live, and other supported live-chat providers.",
    moduleRoute: "live-chat",
    moduleLabel: "Live Chat",
    implemented: true,
  },
  {
    id: "scoreboard",
    label: "Scoreboard",
    description:
      "Sports and game scoring: teams/players, scores, periods, possession/state, and sport-specific controls.",
    moduleRoute: "scoreboard",
    moduleLabel: "Scoreboard",
    implemented: false,
  },
  {
    id: "timer",
    label: "Timer",
    description: "Countdown, count-up, clock, time-of-day, and triggered timers.",
    moduleRoute: "timer",
    moduleLabel: "Timer",
    implemented: false,
  },
  {
    id: "lower-thirds",
    label: "Lower Thirds",
    description:
      "Structured lower-third content: names, titles, IDs, speakers, guests, and reusable person records.",
    moduleRoute: "lower-thirds",
    moduleLabel: "Lower Thirds",
    implemented: false,
  },
  {
    id: "display-only",
    label: "Display Only",
    description:
      "Graphics project with no dedicated data or control module yet. Can later add Data Source or other capabilities.",
    moduleRoute: null,
    moduleLabel: "Displays",
    implemented: true,
  },
  {
    id: "social-feed",
    label: "Social Feed",
    description:
      "Social-post, comment, and hashtag ingestion separate from conversational Live Chat.",
    moduleRoute: "social-feed",
    moduleLabel: "Social Feed",
    implemented: false,
  },
  {
    id: "results-leaderboard",
    label: "Results / Leaderboard",
    description:
      "Rankings, standings, race results, leaderboards, and tournament results.",
    moduleRoute: "results",
    moduleLabel: "Results / Leaderboard",
    implemented: false,
  },
  {
    id: "rundown-schedule",
    label: "Rundown / Schedule",
    description:
      "Programming and event schedules, rundown workflows, and NOW / NEXT / LATER.",
    moduleRoute: "google-sheet",
    moduleLabel: "Data Source",
    implemented: true,
  },
  {
    id: "election-results",
    label: "Election / Live Results",
    description:
      "Candidates, races, percentages, and precinct/results workflows.",
    moduleRoute: "election-results",
    moduleLabel: "Election / Live Results",
    implemented: false,
  },
  {
    id: "weather",
    label: "Weather",
    description:
      "Current conditions, forecasts, weather alerts, and API-driven weather graphics.",
    moduleRoute: "weather",
    moduleLabel: "Weather",
    implemented: false,
  },
  {
    id: "statistics",
    label: "Statistics",
    description:
      "Live player, team, or event statistics where the main workflow is statistical presentation.",
    moduleRoute: "statistics",
    moduleLabel: "Statistics",
    implemented: false,
  },
  {
    id: "manual-controller",
    label: "Manual Controller",
    description:
      "Operator-entered project data as a primary workflow, not merely a fallback.",
    moduleRoute: "controller",
    moduleLabel: "Manual Controller",
    implemented: true,
  },
  {
    id: "automation-trigger",
    label: "Automation / Trigger",
    description:
      "Event-driven project actions and future Companion, triggers, automation workflows, and external control.",
    moduleRoute: "automation",
    moduleLabel: "Automation",
    implemented: false,
  },
] as const;

const CAPABILITY_BY_ID = new Map(
  PROJECT_CAPABILITY_CATALOG.map((entry) => [entry.id, entry]),
);

export function isProjectCapabilityId(value: string): value is ProjectCapabilityId {
  return CAPABILITY_BY_ID.has(value as ProjectCapabilityId);
}

export function getCapabilityDefinition(
  id: string,
): ProjectCapabilityDefinition | null {
  return CAPABILITY_BY_ID.get(id as ProjectCapabilityId) ?? null;
}

export function getCapabilityLabel(id: string): string {
  return getCapabilityDefinition(id)?.label ?? id;
}

export function normalizeCapabilityIds(
  values: readonly string[] | null | undefined,
): ProjectCapabilityId[] {
  if (!values?.length) {
    return [];
  }
  const seen = new Set<ProjectCapabilityId>();
  const result: ProjectCapabilityId[] = [];
  for (const value of values) {
    const trimmed = String(value ?? "").trim();
    if (!isProjectCapabilityId(trimmed) || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

export function validateCapabilitySelection(
  values: readonly string[] | null | undefined,
): { ok: true; capabilities: ProjectCapabilityId[] } | { ok: false; error: string } {
  const capabilities = normalizeCapabilityIds(values);
  if (capabilities.length === 0) {
    return {
      ok: false,
      error: "Select at least one capability. Use Display Only for a blank graphics project.",
    };
  }
  return { ok: true, capabilities };
}

/** Default capabilities for legacy project_type rows (migration / fallback). */
export function defaultCapabilitiesForProjectType(
  projectType: string | null | undefined,
): ProjectCapabilityId[] {
  switch (projectType) {
    case "bag-graphics":
      return ["webpage-scraper", "manual-controller"];
    case "sema-schedule":
      return ["data-source", "rundown-schedule", "manual-controller"];
    case "webpage-scraper":
      return ["webpage-scraper"];
    case "json-ingest":
    case "google-sheet-ingest":
      return ["data-source"];
    case "live-chat":
      return ["live-chat"];
    case "modular":
      return ["display-only"];
    default:
      return ["display-only"];
  }
}

/**
 * Resolve a legacy project_type for engine seeding / package identity.
 * Capabilities remain the source of truth for modules.
 */
export function resolveProjectTypeFromCapabilities(
  capabilities: readonly ProjectCapabilityId[],
): string {
  if (capabilities.includes("webpage-scraper")) {
    return "webpage-scraper";
  }
  if (
    capabilities.includes("data-source") ||
    capabilities.includes("rundown-schedule")
  ) {
    return "json-ingest";
  }
  return "modular";
}

export type CapabilityNavItem = {
  href: string;
  label: string;
  capabilityId: ProjectCapabilityId | null;
  placeholder: boolean;
};

/**
 * Deterministic module order (Pass 22).
 * Never depend on Set insertion order or DB alphabetical capability order.
 *
 * Overview (caller) → data ingestion → control → Displays/Settings (caller)
 */
export const CAPABILITY_NAV_ORDER: readonly ProjectCapabilityId[] = [
  // Data ingestion
  "data-source",
  "webpage-scraper",
  "live-chat",
  "social-feed",
  "weather",
  "rundown-schedule",
  "election-results",
  "statistics",
  "results-leaderboard",
  // Control
  "manual-controller",
  "scoreboard",
  "timer",
  "lower-thirds",
  "automation-trigger",
  // Graphics-only flag (no dedicated module route)
  "display-only",
] as const;

export function sortCapabilitiesForNav(
  capabilities: readonly ProjectCapabilityId[],
): ProjectCapabilityId[] {
  const present = new Set(normalizeCapabilityIds(capabilities));
  const ordered: ProjectCapabilityId[] = [];
  for (const id of CAPABILITY_NAV_ORDER) {
    if (present.has(id)) {
      ordered.push(id);
      present.delete(id);
    }
  }
  // Any unknown future ids append after known order.
  for (const id of present) {
    ordered.push(id);
  }
  return ordered;
}

/**
 * Build capability-driven nav segments (excluding Overview / Displays / Settings).
 * Dedupes by href so overlapping routes (e.g. rundown → google-sheet) appear once.
 */
export function buildCapabilityNavItems(
  capabilities: readonly ProjectCapabilityId[],
): CapabilityNavItem[] {
  const items: CapabilityNavItem[] = [];
  const seenHrefs = new Set<string>();

  for (const id of sortCapabilitiesForNav(capabilities)) {
    const def = getCapabilityDefinition(id);
    if (!def || !def.moduleRoute) {
      continue;
    }
    const href = `/${def.moduleRoute}`;
    if (seenHrefs.has(href)) {
      continue;
    }
    seenHrefs.add(href);
    items.push({
      href,
      label: def.moduleLabel,
      capabilityId: id,
      placeholder: !def.implemented,
    });
  }

  return items;
}

export const MAX_CAPABILITY_TAGS_VISIBLE = 3;
