export type PlatformRole = "owner" | "admin" | "user";

export type AccessRequestStatus = "pending" | "approved" | "rejected";

export type ProjectAccessLevel = "manager" | "operator" | "viewer";

export type Profile = {
  id: string;
  full_name: string | null;
  company: string | null;
  role: PlatformRole;
  created_at: string;
  updated_at: string;
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

// Future: project_members row shape (table not yet created)
export type ProjectMember = {
  project_id: string;
  user_id: string;
  access_level: ProjectAccessLevel;
  assigned_by: string | null;
  created_at: string;
};
