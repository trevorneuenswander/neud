import { DisplaysPageClient } from "@/components/displays/DisplaysPageClient";
import { ProjectPlaceholderPage } from "@/components/projects/ProjectPlaceholderPage";
import { isBroadArrowCanonicalProject } from "@/lib/bag/broad-arrow-phase";
import { requireProjectAccess } from "@/lib/projects/authorization";
import { ensureProjectEnginesInitialized } from "@/lib/data-engines/authorization";
import { getProjectEngines } from "@/lib/data-engines/queries";
import { localListDeveloperDisplays, localListDisplayVersionSummaries } from "@/lib/local/developer-tools-api";
import { localGetProjectDisplays, localListArchivedDisplays } from "@/lib/local/displays-api";
import {
  buildDisplayRegistry,
  LOWER_TICKER_V5_DISPLAY_ID,
  NEW_BID_DISPLAY_V1_ID,
  NEW_TICKER_V1_ID,
  PYLON_DISPLAY_ID,
} from "@/lib/displays/registry";
import { shouldUseLocalData } from "@/lib/local/mode";
import { localGetEngineDetail } from "@/lib/local/api";
import type { DisplayListItem } from "@/lib/displays/displays-list-types";
import { resolveRendererKey } from "@/lib/displays/broad-arrow/resolve-renderer-key";
import { projectSupportsSemaWorkflow } from "@/lib/projects/constants";

type ProjectDisplaysPageProps = {
  params: Promise<{ slug: string }>;
};

/** Package-gated project displays (Broad Arrow + SEMA) → generic DisplaysPageClient cards. */
function buildInstalledPackageDisplayItems(input: {
  displays: Awaited<ReturnType<typeof localGetProjectDisplays>>["displays"];
  developerDisplays: Awaited<ReturnType<typeof localListDeveloperDisplays>>["displays"];
  versionSummaries: Awaited<ReturnType<typeof localListDisplayVersionSummaries>>["summaries"];
}): DisplayListItem[] {
  const versionByDisplayId = new Map(
    input.versionSummaries.map((summary) => [summary.displayId, summary]),
  );
  const versionByDisplayKey = new Map(
    input.versionSummaries.map((summary) => [summary.displayKey, summary]),
  );
  const developerByKey = new Map(
    input.developerDisplays.map((display) => [display.displayKey, display]),
  );

  return input.displays
    .map((row) => {
      const developerDisplay = developerByKey.get(row.display_key);
      if (!developerDisplay || developerDisplay.archived) {
        return null;
      }

      const versionSummary =
        versionByDisplayId.get(row.id) ?? versionByDisplayKey.get(row.display_key) ?? null;
      const persistedName = row.name?.trim() || developerDisplay.name;

      return {
        kind: "custom" as const,
        id: developerDisplay.displayKey,
        persistId: row.id,
        refreshRateMs: row.refresh_rate_ms ?? 5000,
        displayWidth: row.width ?? 1920,
        displayHeight: row.height ?? 1080,
        activeVersionNumber: versionSummary?.activeVersionNumber ?? null,
        activeVersionCreatedAt: versionSummary?.activeVersionCreatedAt ?? null,
        rendererKey: resolveRendererKey(
          row.display_key,
          row.settings && typeof row.settings === "object" ? row.settings : null,
        ) as string | null,
        display: { ...developerDisplay, name: persistedName },
      };
    })
    .filter(
      (item): item is Extract<DisplayListItem, { kind: "custom" }> => item !== null,
    );
}

export default async function ProjectDisplaysPage({ params }: ProjectDisplaysPageProps) {
  const { slug } = await params;
  const access = await requireProjectAccess(slug);
  const isBroadArrow = isBroadArrowCanonicalProject({ slug });

  if (access.project.project_type === "bag-graphics" && shouldUseLocalData()) {
    let pylonEnabled = true;
    let lowerTickerEnabled = true;
    let newBidDisplayEnabled = false;
    let newTickerEnabled = false;
    let hasLiveSnapshot = false;
    const viewerBaseUrl = "http://127.0.0.1:3000";
    const versionSummaries = (
      await localListDisplayVersionSummaries(slug).catch(() => ({ summaries: [] }))
    ).summaries;

    if (isBroadArrow) {
      const { displays } = await localGetProjectDisplays(slug).catch(() => ({ displays: [] }));
      // Developer display rows are required to build package cards (name, published HTML).
      // Always load them for Broad Arrow; canManageSettings only gates Archived/Add controls.
      const developerDisplays = (
        await localListDeveloperDisplays(slug).catch(() => ({ displays: [] }))
      ).displays;
      const archivedDisplays = access.canManageSettings
        ? (await localListArchivedDisplays(slug).catch(() => ({ displays: [] }))).displays
        : [];

      await ensureProjectEnginesInitialized(access.project.id).catch(() => undefined);
      const engines = await getProjectEngines(access.project.id).catch(() => []);
      const engineId = engines[0]?.id;
      if (engineId) {
        const bundle = await localGetEngineDetail(engineId).catch(() => null);
        hasLiveSnapshot = Boolean(
          bundle &&
            ((bundle.recentSnapshots as unknown[] | undefined)?.length ||
              bundle.latestSnapshot),
        );
      }

      const displayItems = buildInstalledPackageDisplayItems({
        displays,
        developerDisplays,
        versionSummaries,
      });

      if (process.env.NODE_ENV !== "production") {
        const developerKeys = new Set(developerDisplays.map((row) => row.displayKey));
        const excluded = displays
          .filter((row) => !developerKeys.has(row.display_key))
          .map((row) => ({
            id: row.id,
            displayKey: row.display_key,
            reason: "missing_developer_display_row",
          }));
        console.debug("[Displays][BroadArrowPage]", {
          projectSlug: slug,
          projectId: access.project.id,
          projectRole: access.projectRole,
          canManageSettings: access.canManageSettings,
          projectDisplayCount: displays.length,
          developerDisplayCount: developerDisplays.length,
          visibleCardCount: displayItems.length,
          archivedCount: archivedDisplays.length,
          excluded,
        });
      }

      return (
        <DisplaysPageClient
          projectSlug={slug}
          projectId={access.project.id}
          initialItems={displayItems}
          archivedCount={archivedDisplays.length}
          hasLiveSnapshot={hasLiveSnapshot}
          canManageSettings={access.canManageSettings}
          canReorder={access.canOperateDisplays}
        />
      );
    }

    try {
      const { displays } = await localGetProjectDisplays(slug);
      pylonEnabled =
        displays.find((display) => display.display_key === PYLON_DISPLAY_ID)?.enabled ??
        true;
      lowerTickerEnabled =
        displays.find((display) => display.display_key === LOWER_TICKER_V5_DISPLAY_ID)
          ?.enabled ?? true;
      newBidDisplayEnabled =
        displays.find((display) => display.display_key === NEW_BID_DISPLAY_V1_ID)?.enabled ??
        false;
      newTickerEnabled =
        displays.find((display) => display.display_key === NEW_TICKER_V1_ID)?.enabled ?? false;

      await ensureProjectEnginesInitialized(access.project.id);
      const engines = await getProjectEngines(access.project.id);
      const engineId = engines[0]?.id;
      if (engineId) {
        const bundle = await localGetEngineDetail(engineId);
        hasLiveSnapshot = Boolean(
          (bundle.recentSnapshots as unknown[] | undefined)?.length ||
            bundle.latestSnapshot,
        );
      }

      const registry = buildDisplayRegistry({
        baseUrl: viewerBaseUrl,
        pylonEnabled,
        lowerTickerV5Enabled: lowerTickerEnabled,
        newBidDisplayV1Enabled: newBidDisplayEnabled,
        newTickerV1Enabled: newTickerEnabled,
      });

      // Same as Broad Arrow/SEMA: developer rows feed display cards for all authorized roles.
      const developerDisplays = (
        await localListDeveloperDisplays(slug).catch(() => ({ displays: [] }))
      ).displays;
      const archivedDisplays = access.canManageSettings
        ? (await localListArchivedDisplays(slug).catch(() => ({ displays: [] }))).displays
        : [];
      const developerByKey = new Map(
        developerDisplays.map((display) => [display.displayKey, display]),
      );
      const registryIds = new Set(registry.map((display) => display.id));
      const customProjectDisplays = developerDisplays.filter(
        (display) =>
          (display.sourceType === "project-html" ||
            display.sourceType === "project-video") &&
          !display.archived &&
          !registryIds.has(display.displayKey),
      );

      const displayKeyToPersistId = new Map(
        displays.map((display) => [display.display_key, display.id]),
      );

      const registryById = new Map(registry.map((display) => [display.id, display]));
      const customByKey = new Map(
        customProjectDisplays.map((display) => [display.displayKey, display]),
      );

      const displayRowByKey = new Map(
        displays.map((display) => [display.display_key, display]),
      );

      const versionByDisplayId = new Map(
        versionSummaries.map((summary) => [summary.displayId, summary]),
      );
      const versionByDisplayKey = new Map(
        versionSummaries.map((summary) => [summary.displayKey, summary]),
      );

      const displayItems = displays
        .map((row) => {
          const versionSummary =
            versionByDisplayId.get(row.id) ?? versionByDisplayKey.get(row.display_key) ?? null;
          const registryDisplay = registryById.get(row.display_key);
          if (registryDisplay) {
            const developerDisplay = developerByKey.get(row.display_key) ?? null;
            const persistedName = row.name?.trim() || registryDisplay.name;
            return {
              kind: "registry" as const,
              id: row.display_key,
              persistId: row.id,
              refreshRateMs: row.refresh_rate_ms ?? 5000,
              displayWidth: row.width ?? 1920,
              displayHeight: row.height ?? 1080,
              activeVersionNumber: versionSummary?.activeVersionNumber ?? null,
              activeVersionCreatedAt: versionSummary?.activeVersionCreatedAt ?? null,
              cardDescription: developerDisplay?.description ?? registryDisplay.description ?? null,
              display: { ...registryDisplay, name: persistedName },
              developerDisplay: developerDisplay
                ? { ...developerDisplay, name: persistedName }
                : null,
            };
          }
          const customDisplay = customByKey.get(row.display_key);
          if (customDisplay) {
            return {
              kind: "custom" as const,
              id: customDisplay.displayKey,
              persistId: row.id,
              refreshRateMs: row.refresh_rate_ms ?? 5000,
              displayWidth: row.width ?? 1920,
              displayHeight: row.height ?? 1080,
              activeVersionNumber: versionSummary?.activeVersionNumber ?? null,
              activeVersionCreatedAt: versionSummary?.activeVersionCreatedAt ?? null,
              rendererKey: resolveRendererKey(
                row.display_key,
                row.settings && typeof row.settings === "object" ? row.settings : null,
              ) as string | null,
              display: customDisplay,
            };
          }
          return null;
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      for (const display of registry) {
        if (displayItems.some((item) => item.id === display.id)) continue;
        const row = displayRowByKey.get(display.id);
        const versionSummary =
          versionByDisplayKey.get(display.id) ??
          (row ? versionByDisplayId.get(row.id) : null) ??
          null;
        const developerDisplay = developerByKey.get(display.id) ?? null;
        const rowName = row?.name?.trim();
        const persistedName = rowName || developerDisplay?.name || display.name;
        displayItems.push({
          kind: "registry" as const,
          id: display.id,
          persistId: displayKeyToPersistId.get(display.id) ?? display.id,
          refreshRateMs: row?.refresh_rate_ms ?? 5000,
          displayWidth: row?.width ?? 1920,
          displayHeight: row?.height ?? 1080,
          activeVersionNumber: versionSummary?.activeVersionNumber ?? null,
          activeVersionCreatedAt: versionSummary?.activeVersionCreatedAt ?? null,
          cardDescription: developerDisplay?.description ?? display.description ?? null,
          display: { ...display, name: persistedName },
          developerDisplay: developerDisplay
            ? { ...developerDisplay, name: persistedName }
            : null,
        });
      }

      return (
        <DisplaysPageClient
          projectSlug={slug}
          projectId={access.project.id}
          initialItems={displayItems}
          archivedCount={archivedDisplays.length}
          hasLiveSnapshot={hasLiveSnapshot}
          canManageSettings={access.canManageSettings}
          canReorder={access.canOperateDisplays}
        />
      );
    } catch {
      pylonEnabled = true;
      lowerTickerEnabled = true;
    }

    const registry = buildDisplayRegistry({
      baseUrl: viewerBaseUrl,
      pylonEnabled,
      lowerTickerV5Enabled: lowerTickerEnabled,
      newBidDisplayV1Enabled: newBidDisplayEnabled,
      newTickerV1Enabled: newTickerEnabled,
    });

    return (
      <DisplaysPageClient
        projectSlug={slug}
        projectId={access.project.id}
        initialItems={registry.map((display) => {
          const versionSummary = versionSummaries.find((summary) => summary.displayKey === display.id) ?? null;
          return {
            kind: "registry" as const,
            id: display.id,
            persistId: display.id,
            refreshRateMs: 5000,
            displayWidth: 1920,
            displayHeight: 1080,
            activeVersionNumber: versionSummary?.activeVersionNumber ?? null,
            activeVersionCreatedAt: versionSummary?.activeVersionCreatedAt ?? null,
            cardDescription: display.description ?? null,
            display,
            developerDisplay: null,
          };
        })}
        archivedCount={0}
        hasLiveSnapshot={hasLiveSnapshot}
        canManageSettings={access.canManageSettings}
        canReorder={access.canOperateDisplays}
      />
    );
  }

  // SEMA package projects: same generic DisplaysPageClient as Broad Arrow.
  // First failing UI boundary (Pass 6): SEMA previously fell through to ProjectPlaceholderPage
  // ("vMix-ready…"), so Schedule Ticker never appeared even when installed/hydrated.
  if (projectSupportsSemaWorkflow(access.project.project_type) && shouldUseLocalData()) {
    const versionSummaries = (
      await localListDisplayVersionSummaries(slug).catch(() => ({ summaries: [] }))
    ).summaries;
    const { displays } = await localGetProjectDisplays(slug).catch(() => ({ displays: [] }));
    // Developer display rows are required to build package cards (name, published HTML).
    // Always load them for SEMA; canManageSettings only gates Archived/Add controls.
    const developerDisplays = (
      await localListDeveloperDisplays(slug).catch(() => ({ displays: [] }))
    ).displays;
    const archivedDisplays = access.canManageSettings
      ? (await localListArchivedDisplays(slug).catch(() => ({ displays: [] }))).displays
      : [];

    const displayItems = buildInstalledPackageDisplayItems({
      displays,
      developerDisplays,
      versionSummaries,
    });

    return (
      <DisplaysPageClient
        projectSlug={slug}
        projectId={access.project.id}
        initialItems={displayItems}
        archivedCount={archivedDisplays.length}
        hasLiveSnapshot={false}
        canManageSettings={access.canManageSettings}
        canReorder={access.canOperateDisplays}
      />
    );
  }

  return (
    <ProjectPlaceholderPage
      title="Displays"
      description="Local display URLs for this project's on-air graphics."
    />
  );
}
