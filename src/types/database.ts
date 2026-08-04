export type ApplicationRole = "owner" | "admin" | "operator" | "viewer";

/** Canonical platform role stored on profiles.role */
export type PlatformRole = ApplicationRole;

export type AccessRequestStatus = "pending" | "approved" | "rejected";

export type ProjectAccessLevel = "manager" | "operator" | "viewer";

export type ProjectDataType =
  | "webpage-scraper"
  | "json-ingest"
  | "google-sheet-ingest"
  | "bag-graphics";

/** @deprecated Use ProjectDataType */
export type ProjectType = ProjectDataType;

export type ProjectStatus = "draft" | "active" | "maintenance" | "archived";

export type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone_number: string | null;
  team: string | null;
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
  project_type: ProjectDataType;
  status: ProjectStatus;
  is_active: boolean;
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

export type ProjectPublishingSettingsRow = {
  project_id: string;
  online_publishing_enabled: boolean;
  active_publisher_instance_id: string | null;
  latest_published_revision: number;
  last_successful_publish_at: string | null;
  last_publish_error: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectCanonicalSnapshotRow = {
  project_id: string;
  contract_version: string;
  revision: number;
  generated_at: string;
  received_at: string;
  publisher_instance_id: string;
  source_mode: "webpage-scraper" | "local-controller";
  source_connected: boolean;
  payload: Record<string, unknown>;
  payload_hash: string;
  updated_at: string;
};

export type ProjectPublisherLeaseRow = {
  project_id: string;
  publisher_instance_id: string;
  acquired_at: string;
  last_heartbeat_at: string;
  lease_expires_at: string;
  released_at: string | null;
  created_at: string;
  updated_at: string;
};
