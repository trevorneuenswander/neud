import type { BagLiveStateService } from "../bag/live-state/bag-live-state-service";
import type { DisplaysRepository, LocalDisplay } from "../repositories/displays-repository";
import type { ProjectsRepository } from "../repositories/projects-repository";

export const BAG_DISPLAY_KEY = "bag-auction";
export const BAG_DISPLAY_NAME = "BAG Auction Display";
export const BAG_DISPLAY_TYPE = "bag-auction";

export class BagDisplayService {
  constructor(
    private readonly projects: ProjectsRepository,
    private readonly displays: DisplaysRepository,
    private readonly bagLiveState: BagLiveStateService,
  ) {}

  ensureBagDisplay(projectId: string, localApiBaseUrl: string): LocalDisplay | null {
    const project = this.projects.getById(projectId);
    if (!project || project.projectType !== "bag-graphics") {
      return null;
    }

    const displayUrl = this.bagLiveState.getDisplayUrl(projectId, localApiBaseUrl);
    return this.displays.upsert({
      projectId,
      name: BAG_DISPLAY_NAME,
      displayKey: BAG_DISPLAY_KEY,
      settings: {
        displayType: BAG_DISPLAY_TYPE,
        url: displayUrl,
        width: 1920,
        height: 1080,
        background: "transparent",
      },
    });
  }

  listProjectDisplays(projectId: string, localApiBaseUrl: string): LocalDisplay[] {
    const project = this.projects.getById(projectId);
    if (!project) return [];

    if (project.projectType === "bag-graphics") {
      this.ensureBagDisplay(projectId, localApiBaseUrl);
    }

    return this.displays.listByProject(projectId);
  }

  repairAllBagProjects(localApiBaseUrl: string) {
    for (const project of this.projects.list()) {
      if (project.projectType !== "bag-graphics") continue;
      try {
        this.ensureBagDisplay(project.id, localApiBaseUrl);
      } catch (error) {
        console.error(
          `[bag-display] Failed to ensure display for project ${project.id}:`,
          error,
        );
      }
    }
  }
}
