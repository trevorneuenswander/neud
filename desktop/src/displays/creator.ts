import { DEFAULT_OWNER_EMAIL } from "../auth/default-owner-email";

export type ProjectCreator = {
  name: string;
  email: string;
};

export const DEFAULT_PROJECT_CREATOR: ProjectCreator = {
  name: "Trevor Neuenswander",
  email: DEFAULT_OWNER_EMAIL,
};

export const CREATOR_ACCOUNT_EMAIL = DEFAULT_PROJECT_CREATOR.email.toLowerCase();

type CreatorAuthUser = {
  email?: string | null;
  displayName?: string | null;
  fullName?: string | null;
};

export function resolveProjectCreator(
  authUser?: CreatorAuthUser | null,
): ProjectCreator {
  const email = authUser?.email?.trim().toLowerCase() ?? "";
  if (email === CREATOR_ACCOUNT_EMAIL) {
    const name =
      authUser?.displayName?.trim() ||
      authUser?.fullName?.trim() ||
      DEFAULT_PROJECT_CREATOR.name;
    return {
      name,
      email: authUser?.email?.trim() || DEFAULT_PROJECT_CREATOR.email,
    };
  }

  return DEFAULT_PROJECT_CREATOR;
}
