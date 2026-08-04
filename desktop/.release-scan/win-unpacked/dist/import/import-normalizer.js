"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildImportPackage = buildImportPackage;
const import_types_1 = require("./import-types");
function buildImportPackage(input) {
    const settingsByEngine = groupBy(input.settings, (row) => row.engine_id);
    const sourcesByEngine = groupBy(input.scraperSources, (row) => row.engine_id);
    const snapshotByEngine = new Map();
    for (const snapshot of input.snapshots) {
        if (!snapshotByEngine.has(snapshot.engine_id)) {
            snapshotByEngine.set(snapshot.engine_id, snapshot);
        }
    }
    const enginesByProject = groupBy(input.engines, (row) => row.project_id);
    const projects = input.projects.map((project) => {
        const engines = (enginesByProject.get(project.id) ?? []).map((engine) => normalizeEngine(engine, settingsByEngine.get(engine.id)?.[0] ?? null, sourcesByEngine.get(engine.id) ?? [], snapshotByEngine.get(engine.id) ?? null));
        return normalizeProject(project, engines);
    });
    return {
        version: import_types_1.NEUD_IMPORT_VERSION,
        exportedAt: new Date().toISOString(),
        source: "supabase",
        projects,
    };
}
function normalizeProject(project, engines) {
    return {
        id: project.id,
        name: project.name,
        slug: project.slug,
        description: project.description ?? null,
        projectType: project.project_type,
        status: normalizeProjectStatus(project.status),
        displayToken: project.display_token ?? null,
        theme: project.theme ?? "default",
        icon: project.icon ?? "folder",
        logoUrl: project.logo_url ?? null,
        primaryColor: project.primary_color ?? null,
        secondaryColor: project.secondary_color ?? null,
        settings: asRecord(project.settings),
        metadata: asRecord(project.metadata),
        archivedAt: project.archived_at ?? null,
        createdAt: project.created_at,
        updatedAt: project.updated_at,
        engines,
    };
}
function normalizeEngine(engine, settings, scraperSources, snapshot) {
    const config = asRecord(engine.config);
    const executionMode = typeof engine.execution_mode === "string"
        ? engine.execution_mode
        : typeof config.execution_mode === "string"
            ? String(config.execution_mode)
            : "local-desktop";
    return {
        id: engine.id,
        name: engine.name,
        engineKey: engine.engine_key,
        engineType: engine.engine_type,
        enabled: engine.enabled !== false,
        desiredState: engine.desired_state === "running" ? "running" : "stopped",
        executionMode,
        config: {
            ...config,
            execution_mode: executionMode,
        },
        settings: settings ? normalizeSettings(settings) : null,
        scraperSources: scraperSources
            .sort((left, right) => left.position - right.position)
            .map(normalizeScraperSource),
        latestSnapshot: snapshot ? normalizeSnapshot(snapshot) : null,
        createdAt: engine.created_at,
        updatedAt: engine.updated_at,
    };
}
function normalizeSettings(settings) {
    return {
        pollIntervalMs: settings.poll_interval_ms,
        detailsTtlMs: settings.details_ttl_ms,
        maxDetailChecksPerPoll: settings.max_detail_checks_per_poll,
        headless: settings.headless !== false,
    };
}
function normalizeScraperSource(source) {
    return {
        id: source.id,
        name: source.name,
        sourceKey: source.source_key,
        url: source.url,
        pageType: source.source_type,
        enabled: source.enabled !== false,
        position: source.position,
        config: asRecord(source.config),
        createdAt: source.created_at,
        updatedAt: source.updated_at,
    };
}
function normalizeSnapshot(snapshot) {
    return {
        id: snapshot.id ? String(snapshot.id) : undefined,
        data: asRecord(snapshot.data),
        recordCount: snapshot.record_count ?? null,
        payloadSizeBytes: snapshot.payload_size_bytes ?? null,
        durationMs: snapshot.duration_ms ?? null,
        capturedAt: snapshot.captured_at,
        createdAt: snapshot.created_at,
    };
}
function normalizeProjectStatus(status) {
    if (status === "draft" || status === "maintenance" || status === "archived") {
        return status;
    }
    return "active";
}
function asRecord(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        return value;
    }
    return {};
}
function groupBy(rows, keyFn) {
    const map = new Map();
    for (const row of rows) {
        const key = keyFn(row);
        const current = map.get(key) ?? [];
        current.push(row);
        map.set(key, current);
    }
    return map;
}
