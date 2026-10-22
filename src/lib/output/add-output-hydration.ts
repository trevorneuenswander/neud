export type OutputLoadState = "idle" | "loading" | "ready" | "empty" | "error" | "blocked";

export type OutputDisplayChoice = {
  id: string;
  name: string;
  enabled: boolean;
  archived?: boolean;
  label: string;
};

export type OutputSourceChoice = {
  sourceType: "display" | "stack";
  sourceId: string;
  label: string;
  group: "Displays" | "Stacks";
  enabled: boolean;
};

/**
 * Displays selectable for Output routes.
 * - Archived displays are always excluded.
 * - Only enabled displays are selectable for new routes.
 * - When editing, `currentDisplayId` may include a now-disabled assignment so the
 *   existing route is not silently rewritten; other disabled displays stay hidden.
 */
export function outputDisplayChoices(
  displays: Array<{
    id: string;
    name: string;
    enabled?: boolean;
    archived?: boolean;
  }>,
  options?: { currentDisplayId?: string | null },
): OutputDisplayChoice[] {
  const currentDisplayId = options?.currentDisplayId ?? null;
  return displays
    .filter((display) => display.archived !== true)
    .filter((display) => display.enabled !== false || display.id === currentDisplayId)
    .map((display) => {
      const enabled = display.enabled !== false;
      return {
        id: display.id,
        name: display.name,
        enabled,
        archived: false,
        label: enabled ? display.name : `${display.name} (disabled)`,
      };
    });
}

/**
 * Combined Displays + Stacks selector for Add/Edit Output.
 * Disabled individual displays are excluded (except current display assignment when editing).
 * Valid pinned stacks (2+ members) are included.
 */
export function outputSourceChoices(input: {
  displays: Array<{
    id: string;
    name: string;
    enabled?: boolean;
    archived?: boolean;
  }>;
  stacks?: Array<{
    id: string;
    label: string;
    memberCount: number;
  }>;
  currentSourceType?: "display" | "stack" | null;
  currentSourceId?: string | null;
}): OutputSourceChoice[] {
  const currentSourceType = input.currentSourceType ?? null;
  const currentSourceId = input.currentSourceId ?? null;
  const displayChoices = outputDisplayChoices(input.displays, {
    currentDisplayId:
      currentSourceType === "display" || currentSourceType == null ? currentSourceId : null,
  }).map((display) => ({
    sourceType: "display" as const,
    sourceId: display.id,
    label: display.label,
    group: "Displays" as const,
    enabled: display.enabled,
  }));

  const stacks = input.stacks ?? [];
  const stackChoices: OutputSourceChoice[] = [];
  const seen = new Set<string>();
  for (const stack of stacks) {
    if (!stack.id || stack.memberCount < 2) continue;
    if (seen.has(stack.id)) continue;
    seen.add(stack.id);
    stackChoices.push({
      sourceType: "stack",
      sourceId: stack.id,
      label: stack.label,
      group: "Stacks",
      enabled: true,
    });
  }

  if (
    currentSourceType === "stack" &&
    currentSourceId &&
    !stackChoices.some((choice) => choice.sourceId === currentSourceId)
  ) {
    stackChoices.push({
      sourceType: "stack",
      sourceId: currentSourceId,
      label: "Stack unavailable",
      group: "Stacks",
      enabled: false,
    });
  }

  return [...displayChoices, ...stackChoices];
}

export function projectSelectorMessage(state: OutputLoadState): string | null {
  if (state === "loading" || state === "idle") return "Loading projects…";
  if (state === "empty") return "No projects available";
  if (state === "error") return "Failed to load projects";
  return null;
}

export function displaySelectorMessage(input: {
  projectSelected: boolean;
  state: OutputLoadState;
}): string | null {
  if (!input.projectSelected) return "Select a project first";
  if (input.state === "loading") return "Loading displays…";
  if (input.state === "empty") return "No active displays available";
  if (input.state === "error") return "Failed to load displays";
  return null;
}

export function sourceSelectorMessage(input: {
  projectSelected: boolean;
  state: OutputLoadState;
  hasChoices: boolean;
}): string | null {
  if (!input.projectSelected) return "Select a project first";
  if (input.state === "loading") return "Loading sources…";
  if (input.state === "error") return "Failed to load sources";
  if (input.state === "empty" || (input.state === "ready" && !input.hasChoices)) {
    return "No displays or stacks available";
  }
  return null;
}

export function monitorSelectorMessage(input: {
  desktop: boolean;
  state: OutputLoadState;
}): string | null {
  if (!input.desktop) return "Monitor discovery unavailable outside the NEUD desktop app";
  if (input.state === "loading") return "Loading monitors…";
  if (input.state === "empty") return "No monitors detected";
  if (input.state === "error") return "Failed to discover monitors";
  return null;
}

export function encodeOutputSourceValue(sourceType: "display" | "stack", sourceId: string): string {
  return sourceType === "stack" ? `stack|${sourceId}` : `display|${sourceId}`;
}

export function parseOutputSourceValue(value: string): {
  sourceType: "display" | "stack";
  sourceId: string;
} | null {
  const trimmed = value.trim();
  if (trimmed.startsWith("stack|")) {
    const sourceId = trimmed.slice("stack|".length);
    return sourceId ? { sourceType: "stack", sourceId } : null;
  }
  if (trimmed.startsWith("display|")) {
    const sourceId = trimmed.slice("display|".length);
    return sourceId ? { sourceType: "display", sourceId } : null;
  }
  // Legacy bare display id.
  return trimmed ? { sourceType: "display", sourceId: trimmed } : null;
}
