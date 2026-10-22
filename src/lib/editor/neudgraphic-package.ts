import type { EditableGraphicSchema } from "./editable-graphic-types";
import type { ProjectBrandKit } from "./brand-kit";
import type {
  NeudGraphicManifest,
  NeudGraphicPackageContents,
  SampleScenario,
  ScheduleSampleData,
} from "./phase4-types";

export type BuildNeudGraphicPackageInput = {
  schema: EditableGraphicSchema;
  displayName: string;
  sampleScenarios?: SampleScenario[];
  brandKit?: ProjectBrandKit | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertEditableGraphicSchema(value: unknown): EditableGraphicSchema {
  if (!isRecord(value)) {
    throw new Error("Invalid .neudgraphic: schema must be an object.");
  }
  if (value.schemaVersion !== 2) {
    throw new Error("Invalid .neudgraphic: schemaVersion must be 2.");
  }
  if (typeof value.graphicType !== "string") {
    throw new Error("Invalid .neudgraphic: graphicType is required.");
  }
  if (typeof value.width !== "number" || typeof value.height !== "number") {
    throw new Error("Invalid .neudgraphic: width and height are required.");
  }
  if (!Array.isArray(value.layers)) {
    throw new Error("Invalid .neudgraphic: layers must be an array.");
  }
  return value as EditableGraphicSchema;
}

function sampleScenariosToSampleData(
  scenarios: SampleScenario[] | undefined,
): Record<string, ScheduleSampleData> {
  const out: Record<string, ScheduleSampleData> = {};
  for (const scenario of scenarios ?? []) {
    if (!scenario?.id) continue;
    out[scenario.id] = scenario.schedule ?? {};
  }
  return out;
}

export function buildNeudGraphicPackage(
  input: BuildNeudGraphicPackageInput,
): NeudGraphicPackageContents {
  const schema = assertEditableGraphicSchema(input.schema);
  const now = new Date().toISOString();
  const sampleData = sampleScenariosToSampleData(input.sampleScenarios);

  const manifest: NeudGraphicManifest = {
    formatVersion: "1",
    displayName: input.displayName.trim() || "Untitled Display",
    createdAt: now,
    updatedAt: now,
    graphicType: schema.graphicType,
    width: schema.width,
    height: schema.height,
    sampleScenarioIds: input.sampleScenarios?.map((s) => s.id),
    brandKitIncluded: Boolean(input.brandKit),
  };

  return {
    manifest,
    schema,
    assets: [],
    sampleData,
    brandKit: input.brandKit ?? null,
  };
}

export function parseNeudGraphicPackage(json: unknown): NeudGraphicPackageContents {
  if (!isRecord(json)) {
    throw new Error("Invalid .neudgraphic: root must be an object.");
  }

  const manifestRaw = json.manifest;
  if (!isRecord(manifestRaw)) {
    throw new Error("Invalid .neudgraphic: manifest is required.");
  }
  if (manifestRaw.formatVersion !== "1") {
    throw new Error('Invalid .neudgraphic: manifest.formatVersion must be "1".');
  }
  if (typeof manifestRaw.displayName !== "string") {
    throw new Error("Invalid .neudgraphic: manifest.displayName is required.");
  }

  const manifest: NeudGraphicManifest = {
    formatVersion: "1",
    displayName: manifestRaw.displayName,
    createdAt: typeof manifestRaw.createdAt === "string" ? manifestRaw.createdAt : "",
    updatedAt: typeof manifestRaw.updatedAt === "string" ? manifestRaw.updatedAt : "",
    graphicType: typeof manifestRaw.graphicType === "string" ? manifestRaw.graphicType : "",
    width: typeof manifestRaw.width === "number" ? manifestRaw.width : 0,
    height: typeof manifestRaw.height === "number" ? manifestRaw.height : 0,
    sampleScenarioIds: Array.isArray(manifestRaw.sampleScenarioIds)
      ? manifestRaw.sampleScenarioIds.filter((id): id is string => typeof id === "string")
      : undefined,
    brandKitIncluded:
      typeof manifestRaw.brandKitIncluded === "boolean" ? manifestRaw.brandKitIncluded : undefined,
  };

  const schema = assertEditableGraphicSchema(json.schema);

  const sampleData: Record<string, ScheduleSampleData> = {};
  if (isRecord(json.sampleData)) {
    for (const [key, value] of Object.entries(json.sampleData)) {
      if (isRecord(value)) {
        sampleData[key] = value as ScheduleSampleData;
      }
    }
  }

  let brandKit: ProjectBrandKit | null = null;
  if (json.brandKit != null) {
    if (!isRecord(json.brandKit)) {
      throw new Error("Invalid .neudgraphic: brandKit must be an object when present.");
    }
    brandKit = json.brandKit as ProjectBrandKit;
  }

  if (!Array.isArray(json.assets)) {
    throw new Error("Invalid .neudgraphic: assets must be an array.");
  }
  if (json.assets.length > 0) {
    throw new Error("Invalid .neudgraphic: assets must be empty in format version 1.");
  }

  return {
    manifest,
    schema,
    assets: [],
    sampleData,
    brandKit,
  };
}

export function serializeNeudGraphicPackage(pkg: NeudGraphicPackageContents): string {
  return JSON.stringify(
    {
      manifest: pkg.manifest,
      schema: pkg.schema,
      assets: pkg.assets,
      sampleData: pkg.sampleData,
      ...(pkg.brandKit ? { brandKit: pkg.brandKit } : {}),
    },
    null,
    2,
  );
}
