/**
 * Desktop mirror of src/lib/projects/capabilities.ts (Pass 21).
 * Keep IDs and labels in sync — tests assert parity.
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
  moduleRoute: string | null;
  moduleLabel: string;
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

export function getCapabilityLabel(id: string): string {
  return CAPABILITY_BY_ID.get(id as ProjectCapabilityId)?.label ?? id;
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

/** Deterministic capability module order (Pass 22) — mirrors web CAPABILITY_NAV_ORDER. */
const CAPABILITY_NAV_ORDER: readonly ProjectCapabilityId[] = [
  "data-source",
  "webpage-scraper",
  "live-chat",
  "social-feed",
  "weather",
  "rundown-schedule",
  "election-results",
  "statistics",
  "results-leaderboard",
  "manual-controller",
  "scoreboard",
  "timer",
  "lower-thirds",
  "automation-trigger",
  "display-only",
];

function sortCapabilitiesForModules(
  capabilities: readonly ProjectCapabilityId[],
): ProjectCapabilityId[] {
  const present = new Set(capabilities);
  const ordered: ProjectCapabilityId[] = [];
  for (const id of CAPABILITY_NAV_ORDER) {
    if (present.has(id)) {
      ordered.push(id);
      present.delete(id);
    }
  }
  for (const id of present) {
    ordered.push(id);
  }
  return ordered;
}

export function capabilityModulesForPackage(
  capabilities: readonly ProjectCapabilityId[],
): Array<{ key: string; label: string; routeSegment: string }> {
  const modules: Array<{ key: string; label: string; routeSegment: string }> = [
    { key: "overview", label: "Overview", routeSegment: "" },
  ];
  const seen = new Set<string>();
  for (const id of sortCapabilitiesForModules(capabilities)) {
    const def = CAPABILITY_BY_ID.get(id);
    if (!def?.moduleRoute || seen.has(def.moduleRoute)) {
      continue;
    }
    seen.add(def.moduleRoute);
    modules.push({
      key: def.id,
      label: def.moduleLabel,
      routeSegment: def.moduleRoute,
    });
  }
  modules.push(
    { key: "displays", label: "Displays", routeSegment: "displays" },
    { key: "settings", label: "Settings", routeSegment: "settings" },
  );
  return modules;
}
