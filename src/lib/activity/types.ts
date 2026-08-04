export type ActivityProjectSummary = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
};

export type ActivityDisplayEvent = {
  id: string;
  projectId: string;
  projectSlug?: string;
  projectName?: string;
  projectDescription?: string | null;
  projectAvailable?: boolean;
  actorId?: string;
  actorName: string;
  message: string;
  rawMessage?: string;
  displayDescription?: string;
  createdAt: string;
  type?: string;
  severity?: "info" | "warning" | "error";
};

export type FullActivityDisplayEvent = ActivityDisplayEvent & {
  projectSlug: string;
  projectName: string;
  projectDescription: string | null;
};

export type ProjectSettingsData = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isActive: boolean;
  updatedAt: string;
  currentUserRole: "owner" | "admin";
};
