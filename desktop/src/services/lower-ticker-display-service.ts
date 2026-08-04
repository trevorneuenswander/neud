import type { AppSettingsRepository } from "../repositories/app-settings-repository";
import type { DisplaysRepository, LocalDisplay } from "../repositories/displays-repository";
import type { ProjectsRepository } from "../repositories/projects-repository";
import { shouldAutoSeedBagDisplays } from "../bag/broad-arrow-phase";
import {
  LOWER_TICKER_V5_DISPLAY_ID,
  LOWER_TICKER_V5_ENABLED_SETTING_KEY,
} from "../displays/lower-ticker-display-constants";

export const LOWER_TICKER_V5_DISPLAY_KEY = LOWER_TICKER_V5_DISPLAY_ID;
export const LOWER_TICKER_V5_DISPLAY_NAME = "Lower Ticker v5";

export class LowerTickerDisplayService {
  constructor(
    private readonly projects: ProjectsRepository,
    private readonly displays: DisplaysRepository,
    private readonly settings: AppSettingsRepository,
  ) {}

  isLowerTickerEnabled(): boolean {
    return this.settings.get<boolean>(LOWER_TICKER_V5_ENABLED_SETTING_KEY, true);
  }

  setLowerTickerEnabled(enabled: boolean): boolean {
    this.settings.set(LOWER_TICKER_V5_ENABLED_SETTING_KEY, enabled);
    this.syncEnabledStateOnAllProjects(enabled);
    return enabled;
  }

  ensureLowerTickerDisplay(
    projectId: string,
    viewerBaseUrl: string,
  ): LocalDisplay | null {
    const project = this.projects.getById(projectId);
    if (!project || project.projectType !== "bag-graphics") {
      return null;
    }
    if (!shouldAutoSeedBagDisplays(project)) {
      return this.displays.getByKey(projectId, LOWER_TICKER_V5_DISPLAY_KEY);
    }

    const origin = viewerBaseUrl.replace(/\/$/, "");
    const viewerUrl = `${origin}/displays/lower-ticker-v5`;

    return this.displays.upsert({
      projectId,
      name: LOWER_TICKER_V5_DISPLAY_NAME,
      displayKey: LOWER_TICKER_V5_DISPLAY_KEY,
      htmlPath: "/displays/lower-ticker-v5",
      enabled: this.isLowerTickerEnabled(),
      settings: {
        displayType: LOWER_TICKER_V5_DISPLAY_KEY,
        url: viewerUrl,
        width: 1920,
        height: 1080,
        background: "transparent",
      },
    });
  }

  listProjectDisplays(projectId: string, viewerBaseUrl: string): LocalDisplay[] {
    const project = this.projects.getById(projectId);
    if (!project) return [];

    if (project.projectType === "bag-graphics") {
      if (!shouldAutoSeedBagDisplays(project)) {
        return this.displays
          .listByProject(projectId)
          .filter((display) => display.displayKey === LOWER_TICKER_V5_DISPLAY_KEY);
      }
      this.ensureLowerTickerDisplay(projectId, viewerBaseUrl);
    }

    return this.displays
      .listByProject(projectId)
      .filter((display) => display.displayKey === LOWER_TICKER_V5_DISPLAY_KEY);
  }

  repairAllBagProjects(viewerBaseUrl: string) {
    for (const project of this.projects.list()) {
      if (project.projectType !== "bag-graphics") continue;
      if (!shouldAutoSeedBagDisplays(project)) continue;
      try {
        this.ensureLowerTickerDisplay(project.id, viewerBaseUrl);
      } catch (error) {
        console.error(
          `[lower-ticker-display] Failed to ensure display for project ${project.id}:`,
          error,
        );
      }
    }
  }

  private syncEnabledStateOnAllProjects(enabled: boolean) {
    for (const project of this.projects.list()) {
      if (project.projectType !== "bag-graphics") continue;
      const existing = this.displays.getByKey(project.id, LOWER_TICKER_V5_DISPLAY_KEY);
      if (!existing) continue;
      this.displays.upsert({
        projectId: project.id,
        name: LOWER_TICKER_V5_DISPLAY_NAME,
        displayKey: LOWER_TICKER_V5_DISPLAY_KEY,
        htmlPath: existing.htmlPath,
        settings: existing.settings,
        enabled,
      });
    }
  }
}
