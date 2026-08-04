import type {
  NeudEngineImport,
  NeudImportPackage,
  NeudProjectImportRecord,
  NeudScraperSourceImport,
  NeudSnapshotImport,
  ImportValidationIssue,
  ImportValidationResult,
} from "./import-types";
import {
  NEUD_IMPORT_VERSION,
  SUPPORTED_DESIRED_STATES,
  SUPPORTED_ENGINE_TYPES,
  SUPPORTED_EXECUTION_MODES,
} from "./import-types";

const MAX_SNAPSHOT_BYTES = 5 * 1024 * 1024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateImportPackage(
  pkg: NeudImportPackage,
): ImportValidationResult {
  const errors: ImportValidationIssue[] = [];
  const warnings: ImportValidationIssue[] = [];

  if (pkg.version !== NEUD_IMPORT_VERSION) {
    errors.push({
      path: "version",
      message: `Unsupported import version ${String(pkg.version)}.`,
    });
  }

  if (pkg.source !== "supabase") {
    errors.push({
      path: "source",
      message: "Only Supabase exports are supported.",
    });
  }

  if (!Array.isArray(pkg.projects)) {
    errors.push({
      path: "projects",
      message: "Import package must include a projects array.",
    });
    return { valid: false, errors, warnings };
  }

  const projectIds = new Set<string>();
  const engineIds = new Set<string>();
  const scraperSourceIds = new Set<string>();

  for (const [index, project] of pkg.projects.entries()) {
    validateProject(project, `projects[${index}]`, errors, warnings);

    if (project.id) {
      if (projectIds.has(project.id)) {
        errors.push({
          path: `projects[${index}].id`,
          message: "Duplicate project ID in import package.",
        });
      }
      projectIds.add(project.id);
    }

    for (const [engineIndex, engine] of project.engines.entries()) {
      validateEngine(
        engine,
        `projects[${index}].engines[${engineIndex}]`,
        errors,
        warnings,
      );

      if (engineIds.has(engine.id)) {
        errors.push({
          path: `projects[${index}].engines[${engineIndex}].id`,
          message: "Duplicate engine ID in import package.",
        });
      }
      engineIds.add(engine.id);

      for (const [sourceIndex, source] of engine.scraperSources.entries()) {
        validateScraperSource(
          source,
          `projects[${index}].engines[${engineIndex}].scraperSources[${sourceIndex}]`,
          errors,
          warnings,
        );

        if (scraperSourceIds.has(source.id)) {
          errors.push({
            path: `projects[${index}].engines[${engineIndex}].scraperSources[${sourceIndex}].id`,
            message: "Duplicate scraper source ID in import package.",
          });
        }
        scraperSourceIds.add(source.id);
      }

      if (engine.latestSnapshot) {
        validateSnapshot(
          engine.latestSnapshot,
          engine.id,
          `projects[${index}].engines[${engineIndex}].latestSnapshot`,
          errors,
          warnings,
        );
      }
    }

    if (project.engines.length === 0) {
      warnings.push({
        path: `projects[${index}]`,
        message: "Project has no Data Engines.",
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function validateProject(
  project: NeudProjectImportRecord,
  path: string,
  errors: ImportValidationIssue[],
  warnings: ImportValidationIssue[],
) {
  if (!project.id || !UUID_PATTERN.test(project.id)) {
    errors.push({ path: `${path}.id`, message: "Project ID must be a valid UUID." });
  }

  if (!project.name?.trim()) {
    errors.push({ path: `${path}.name`, message: "Project name is required." });
  }

  if (!project.slug?.trim()) {
    errors.push({ path: `${path}.slug`, message: "Project slug is required." });
  }

  if (!project.projectType?.trim()) {
    errors.push({
      path: `${path}.projectType`,
      message: "Project type is required.",
    });
  }

  if (!isRecord(project.settings)) {
    errors.push({
      path: `${path}.settings`,
      message: "Project settings must be an object.",
    });
  }

  if (!isRecord(project.metadata)) {
    errors.push({
      path: `${path}.metadata`,
      message: "Project metadata must be an object.",
    });
  }

  if (project.updatedAt && !isIsoTimestamp(project.updatedAt)) {
    warnings.push({
      path: `${path}.updatedAt`,
      message: "Project updated timestamp is not ISO formatted.",
    });
  }
}

function validateEngine(
  engine: NeudEngineImport,
  path: string,
  errors: ImportValidationIssue[],
  warnings: ImportValidationIssue[],
) {
  if (!engine.id || !UUID_PATTERN.test(engine.id)) {
    errors.push({ path: `${path}.id`, message: "Engine ID must be a valid UUID." });
  }

  if (!engine.name?.trim()) {
    errors.push({ path: `${path}.name`, message: "Engine name is required." });
  }

  if (!engine.engineKey?.trim()) {
    errors.push({
      path: `${path}.engineKey`,
      message: "Engine key is required.",
    });
  }

  if (!SUPPORTED_ENGINE_TYPES.includes(engine.engineType as never)) {
    warnings.push({
      path: `${path}.engineType`,
      message: `Engine type "${engine.engineType}" is not fully supported locally.`,
    });
  }

  if (!SUPPORTED_DESIRED_STATES.includes(engine.desiredState as never)) {
    errors.push({
      path: `${path}.desiredState`,
      message: `Unsupported desired state "${engine.desiredState}".`,
    });
  }

  if (!SUPPORTED_EXECUTION_MODES.includes(engine.executionMode as never)) {
    errors.push({
      path: `${path}.executionMode`,
      message: `Unsupported execution mode "${engine.executionMode}".`,
    });
  }

  if (!isRecord(engine.config)) {
    errors.push({
      path: `${path}.config`,
      message: "Engine configuration must be an object.",
    });
  }

  if (engine.settings) {
    if (
      !Number.isFinite(engine.settings.pollIntervalMs) ||
      engine.settings.pollIntervalMs < 1000
    ) {
      errors.push({
        path: `${path}.settings.pollIntervalMs`,
        message: "Poll interval must be at least 1000 ms.",
      });
    }
  } else if (engine.engineType === "webpage-scraper") {
    warnings.push({
      path: `${path}.settings`,
      message: "Missing scraper settings; defaults will be used.",
    });
  }
}

function validateScraperSource(
  source: NeudScraperSourceImport,
  path: string,
  errors: ImportValidationIssue[],
  warnings: ImportValidationIssue[],
) {
  if (!source.id || !UUID_PATTERN.test(source.id)) {
    errors.push({
      path: `${path}.id`,
      message: "Scraper source ID must be a valid UUID.",
    });
  }

  if (!source.name?.trim()) {
    errors.push({ path: `${path}.name`, message: "Source name is required." });
  }

  if (!source.sourceKey?.trim()) {
    errors.push({
      path: `${path}.sourceKey`,
      message: "Source key is required.",
    });
  }

  if (!source.url?.trim()) {
    errors.push({ path: `${path}.url`, message: "Source URL is required." });
  }

  if (!source.pageType?.trim()) {
    warnings.push({
      path: `${path}.pageType`,
      message: "Source page type is missing.",
    });
  }

  if (!isRecord(source.config)) {
    errors.push({
      path: `${path}.config`,
      message: "Source configuration must be an object.",
    });
  }
}

function validateSnapshot(
  snapshot: NeudSnapshotImport,
  engineId: string,
  path: string,
  errors: ImportValidationIssue[],
  warnings: ImportValidationIssue[],
) {
  if (!isRecord(snapshot.data)) {
    errors.push({
      path: `${path}.data`,
      message: "Snapshot data must be an object.",
    });
    return;
  }

  const payloadSize =
    snapshot.payloadSizeBytes ??
    Buffer.byteLength(JSON.stringify(snapshot.data), "utf8");

  if (payloadSize > MAX_SNAPSHOT_BYTES) {
    warnings.push({
      path: path,
      message: "Snapshot exceeds the size limit and will be skipped.",
    });
  }

  if (snapshot.capturedAt && !isIsoTimestamp(snapshot.capturedAt)) {
    warnings.push({
      path: `${path}.capturedAt`,
      message: "Snapshot captured timestamp is not ISO formatted.",
    });
  }

  if (!engineId) {
    errors.push({
      path,
      message: "Snapshot must belong to an engine.",
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isIsoTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

export function countImportTotals(pkg: NeudImportPackage) {
  let engines = 0;
  let scraperSources = 0;
  let snapshots = 0;

  for (const project of pkg.projects) {
    engines += project.engines.length;
    for (const engine of project.engines) {
      scraperSources += engine.scraperSources.length;
      if (engine.latestSnapshot) snapshots += 1;
    }
  }

  return {
    projects: pkg.projects.length,
    engines,
    scraperSources,
    snapshots,
  };
}
