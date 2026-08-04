import type { AppSettingsRepository } from "../repositories/app-settings-repository";
import type { DisplaysRepository, LocalDisplay } from "../repositories/displays-repository";
import type { ProjectsRepository } from "../repositories/projects-repository";
import { shouldAutoSeedBagDisplays } from "../bag/broad-arrow-phase";
import {
  NEW_BID_DISPLAY_V1_ENABLED_SETTING_KEY,
  NEW_BID_DISPLAY_V1_ID,
  NEW_BID_DISPLAY_V1_NAME,
  NEW_BID_DISPLAY_V1_SLUG,
} from "../displays/new-bid-display-constants";
import {
  NEW_TICKER_V1_ENABLED_SETTING_KEY,
  NEW_TICKER_V1_ID,
  NEW_TICKER_V1_NAME,
  NEW_TICKER_V1_SLUG,
} from "../displays/new-ticker-display-constants";

type DisplaySpec = {
  id: string;
  name: string;
  slug: string;
  enabledSettingKey: string;
  htmlPath: string;
  viewerPath: string;
  dataPath: string;
  width: number;
  height: number;
  description: string;
};

const NEW_BID_DISPLAY_SPEC: DisplaySpec = {
  id: NEW_BID_DISPLAY_V1_ID,
  name: NEW_BID_DISPLAY_V1_NAME,
  slug: NEW_BID_DISPLAY_V1_SLUG,
  enabledSettingKey: NEW_BID_DISPLAY_V1_ENABLED_SETTING_KEY,
  htmlPath: "/displays/new-bid-display-v1",
  viewerPath: "/displays/new-bid-display-v1",
  dataPath: "/api/displays/new-bid-display-v1/data",
  width: 3840,
  height: 2160,
  description: "3840×2160 primary bid display with transparent lower ticker strip.",
};

const NEW_TICKER_DISPLAY_SPEC: DisplaySpec = {
  id: NEW_TICKER_V1_ID,
  name: NEW_TICKER_V1_NAME,
  slug: NEW_TICKER_V1_SLUG,
  enabledSettingKey: NEW_TICKER_V1_ENABLED_SETTING_KEY,
  htmlPath: "/displays/new-ticker-v1",
  viewerPath: "/displays/new-ticker-v1",
  dataPath: "/api/displays/new-ticker-v1/data",
  width: 3840,
  height: 2160,
  description: "240px lower ticker bar for upcoming lots.",
};

export class NewAuctionDisplaysService {
  constructor(
    private readonly projects: ProjectsRepository,
    private readonly displays: DisplaysRepository,
    private readonly settings: AppSettingsRepository,
  ) {}

  isNewBidDisplayEnabled(): boolean {
    return this.settings.get<boolean>(NEW_BID_DISPLAY_V1_ENABLED_SETTING_KEY, false);
  }

  isNewTickerDisplayEnabled(): boolean {
    return this.settings.get<boolean>(NEW_TICKER_V1_ENABLED_SETTING_KEY, false);
  }

  setNewBidDisplayEnabled(enabled: boolean): boolean {
    this.settings.set(NEW_BID_DISPLAY_V1_ENABLED_SETTING_KEY, enabled);
    this.syncEnabledState(NEW_BID_DISPLAY_SPEC, enabled);
    return enabled;
  }

  setNewTickerDisplayEnabled(enabled: boolean): boolean {
    this.settings.set(NEW_TICKER_V1_ENABLED_SETTING_KEY, enabled);
    this.syncEnabledState(NEW_TICKER_DISPLAY_SPEC, enabled);
    return enabled;
  }

  ensureNewBidDisplay(projectId: string, viewerBaseUrl: string): LocalDisplay | null {
    return this.ensureDisplay(projectId, viewerBaseUrl, NEW_BID_DISPLAY_SPEC);
  }

  ensureNewTickerDisplay(projectId: string, viewerBaseUrl: string): LocalDisplay | null {
    return this.ensureDisplay(projectId, viewerBaseUrl, NEW_TICKER_DISPLAY_SPEC);
  }

  repairAllBagProjects(viewerBaseUrl: string) {
    for (const project of this.projects.list()) {
      if (project.projectType !== "bag-graphics") continue;
      if (!shouldAutoSeedBagDisplays(project)) continue;
      try {
        this.ensureNewBidDisplay(project.id, viewerBaseUrl);
        this.ensureNewTickerDisplay(project.id, viewerBaseUrl);
      } catch (error) {
        console.error(
          `[new-auction-displays] Failed to ensure displays for project ${project.id}:`,
          error,
        );
      }
    }
  }

  private ensureDisplay(
    projectId: string,
    viewerBaseUrl: string,
    spec: DisplaySpec,
  ): LocalDisplay | null {
    const project = this.projects.getById(projectId);
    if (!project || project.projectType !== "bag-graphics") {
      return null;
    }
    if (!shouldAutoSeedBagDisplays(project)) {
      return this.displays.getByKey(projectId, spec.slug);
    }

    const origin = viewerBaseUrl.replace(/\/$/, "");
    const dataUrl = `${origin}${spec.dataPath}`;
    const params = new URLSearchParams({
      src: dataUrl,
      poll: "1000",
    });
    const viewerUrl = `${origin}${spec.viewerPath}?${params.toString()}`;

    return this.displays.upsert({
      projectId,
      name: spec.name,
      displayKey: spec.slug,
      htmlPath: spec.htmlPath,
      enabled: this.settings.get<boolean>(spec.enabledSettingKey, false),
      settings: {
        displayType: spec.id,
        sourceType: "project-html",
        url: viewerUrl,
        width: spec.width,
        height: spec.height,
        background: "transparent",
        description: spec.description,
      },
    });
  }

  private syncEnabledState(spec: DisplaySpec, enabled: boolean) {
    for (const project of this.projects.list()) {
      if (project.projectType !== "bag-graphics") continue;
      const existing = this.displays.getByKey(project.id, spec.slug);
      if (!existing) continue;
      this.displays.upsert({
        projectId: project.id,
        name: spec.name,
        displayKey: spec.slug,
        htmlPath: existing.htmlPath,
        settings: existing.settings,
        enabled,
      });
    }
  }
}

export { NEW_BID_DISPLAY_SPEC, NEW_TICKER_DISPLAY_SPEC };
