const DEFAULT_OWNER_EMAIL = "trevorneuenswander@gmail.com";

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function isProtectedNeudOwnerUser(user: {
  id?: string;
  email: string;
  platformRole?: string | null;
}): boolean {
  return (
    normalize(user.email) === normalize(DEFAULT_OWNER_EMAIL) &&
    (user.platformRole ?? "").toLowerCase() === "owner"
  );
}

export const PROJECT_OWNER_REMOVAL_ERROR_CODE = "owner_protected" as const;

export const PROJECT_OWNER_REMOVAL_MESSAGE =
  "The NEUD Owner cannot be removed from a project.";
