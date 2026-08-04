import type { AppSettingsRepository } from "../repositories/app-settings-repository";
import type { DisplaysRepository, LocalDisplay } from "../repositories/displays-repository";
import type { ProjectsRepository } from "../repositories/projects-repository";
import { shouldAutoSeedBagDisplays } from "../bag/broad-arrow-phase";
import {
  PYLON_DISPLAY_ID,
  PYLON_ENABLED_SETTING_KEY,
} from "../displays/pylon-display-constants";

export const PYLON_DISPLAY_KEY = PYLON_DISPLAY_ID;
export const PYLON_DISPLAY_NAME = "Pylon v5";

export class PylonDisplayService {
  constructor(
    private readonly projects: ProjectsRepository,
    private readonly displays: DisplaysRepository,
    private readonly settings: AppSettingsRepository,
  ) {}

  isPylonEnabled(): boolean {
    return this.settings.get<boolean>(PYLON_ENABLED_SETTING_KEY, true);
  }

  setPylonEnabled(enabled: boolean): boolean {
    this.settings.set(PYLON_ENABLED_SETTING_KEY, enabled);
    this.syncEnabledStateOnAllProjects(enabled);
    return enabled;
  }

  ensurePylonDisplay(
    projectId: string,
    viewerBaseUrl: string,
  ): LocalDisplay | null {
    const project = this.projects.getById(projectId);
    if (!project || project.projectType !== "bag-graphics") {
      return null;
    }
    if (!shouldAutoSeedBagDisplays(project)) {
      return this.displays.getByKey(projectId, PYLON_DISPLAY_KEY);
    }

    const origin = viewerBaseUrl.replace(/\/$/, "");
    const viewerUrl = `${origin}/displays/pylon?src=${encodeURIComponent(`${origin}/api/displays/pylon/data`)}&poll=1000`;

    return this.displays.upsert({
      projectId,
      name: PYLON_DISPLAY_NAME,
      displayKey: PYLON_DISPLAY_KEY,
      htmlPath: "/displays/pylon",
      enabled: this.isPylonEnabled(),
      settings: {
        displayType: PYLON_DISPLAY_KEY,
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
          .filter((display) => display.displayKey === PYLON_DISPLAY_KEY);
      }
      this.ensurePylonDisplay(projectId, viewerBaseUrl);
    }

    return this.displays
      .listByProject(projectId)
      .filter((display) => display.displayKey === PYLON_DISPLAY_KEY);
  }

  repairAllBagProjects(viewerBaseUrl: string) {
    for (const project of this.projects.list()) {
      if (project.projectType !== "bag-graphics") continue;
      if (!shouldAutoSeedBagDisplays(project)) continue;
      try {
        this.ensurePylonDisplay(project.id, viewerBaseUrl);
      } catch (error) {
        console.error(
          `[pylon-display] Failed to ensure display for project ${project.id}:`,
          error,
        );
      }
    }
  }

  private syncEnabledStateOnAllProjects(enabled: boolean) {
    for (const project of this.projects.list()) {
      if (project.projectType !== "bag-graphics") continue;
      const existing = this.displays.getByKey(project.id, PYLON_DISPLAY_KEY);
      if (!existing) continue;
      this.displays.upsert({
        projectId: project.id,
        name: PYLON_DISPLAY_NAME,
        displayKey: PYLON_DISPLAY_KEY,
        htmlPath: existing.htmlPath,
        settings: existing.settings,
        enabled,
      });
    }
  }
}
