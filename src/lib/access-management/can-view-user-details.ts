import type { AccessManagementDirectory } from "@/lib/access-management/types";
import {
  canViewUserDetailsInDirectory,
  hasSiteWideDirectoryAccess,
} from "../../../shared/access-management/can-view-user-details";

export {
  canViewUserDetailsInDirectory,
  hasSiteWideDirectoryAccess,
};

export function canViewUserDetails(
  actorUserId: string,
  targetUserId: string,
  directory: AccessManagementDirectory,
): boolean {
  return canViewUserDetailsInDirectory(actorUserId, targetUserId, directory);
}
