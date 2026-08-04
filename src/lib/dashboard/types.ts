export type DashboardProjectSummary = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isActive: boolean;
  updatedAt: string;
};

export type DashboardActivityItem = {
  id: string;
  projectId: string;
  projectSlug: string;
  projectName: string;
  actorId?: string;
  actorName: string;
  type: string;
  message: string;
  createdAt: string;
};

export type DashboardData = {
  recentProjects: DashboardProjectSummary[];
  recentActivity: DashboardActivityItem[];
  onlineDisplays: number;
  runningEngines: number;
  isPureViewer?: boolean;
  accessibleDisplayCount?: number;
};
