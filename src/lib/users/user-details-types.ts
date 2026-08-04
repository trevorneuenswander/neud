import type { PlatformRole } from "@/lib/access/types";

export type UserDetailsTeam = {
  id: string;
  name: string;
  role: string;
  isActive: boolean;
};

export type UserDetailsProject = {
  id: string;
  slug: string;
  name: string;
  teamName: string;
  role: string;
  accessSource: string;
  isActive: boolean;
};

export type UserDetailsProfile = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  teamName: string | null;
  roleLabel: string;
  platformRole: PlatformRole;
  source: "supabase" | "local-cache";
  isActive: boolean;
  supabaseUserId: string | null;
  supabaseAccountAvailable: boolean;
  lastSupabaseSyncAt: string | null;
  teams: UserDetailsTeam[];
  projects: UserDetailsProject[];
};

export type ViewableUserIdsResponse = {
  userIds: string[];
};
