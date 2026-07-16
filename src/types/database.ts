export type PlatformRole = "owner" | "admin" | "user";

export type AccessRequestStatus = "pending" | "approved" | "rejected";

export type ProjectAccessLevel = "manager" | "operator" | "viewer";

export type ProjectType = "bag-graphics";

export type ProjectStatus = "draft" | "active" | "maintenance" | "archived";

export type Profile = {
  id: string;
  full_name: string | null;
  company: string | null;
  role: PlatformRole;
  created_at: string;
  updated_at: string;
};

export type Project = {
  id: string;
  project_number: number;
  owner_id: string;
  name: string;
  slug: string;
  description: string | null;
  project_type: ProjectType;
  status: ProjectStatus;
  display_token: string;
  theme: string;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  icon: string;
  settings: {
    workers: Record<string, unknown>;
  };
  metadata: Record<string, unknown>;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectMember = {
  project_id: string;
  user_id: string;
  access_level: ProjectAccessLevel;
  assigned_by: string | null;
  created_at: string;
};

export type ProjectMemberWithProfile = ProjectMember & {
  profile: Profile & {
    email: string;
  };
};

export type ProfileWithEmail = Profile & {
  email: string;
};

export type AccessRequest = {
  id: string;
  full_name: string;
  email: string;
  company: string;
  comments: string | null;
  status: AccessRequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};
