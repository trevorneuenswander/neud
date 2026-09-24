import { ACCESS_ACTIONS_COLUMN_WIDTH } from "@/lib/access-management/table-action-buttons";

export const TEAM_COLUMN_WIDTHS = ["34%", "12%", "12%", "12%", "18%"] as const;
export const TEAM_MEMBER_COLUMN_WIDTHS = ["22%", "26%", "14%", "14%", "18%"] as const;
export const USER_COLUMN_WIDTHS = ["14%", "20%", "12%", "16%", "14%", "10%", "14%"] as const;
export const USER_COLUMN_WIDTHS_WITH_DETAILS = [
  "16%",
  "16%",
  "16%",
  "14%",
  "12%",
  "10%",
  "10%",
] as const;
export const PROJECT_ACCESS_COLUMN_WIDTHS = [
  "18%",
  "16%",
  "18%",
  "14%",
  "10%",
  ACCESS_ACTIONS_COLUMN_WIDTH,
] as const;

export const PROJECT_TEAM_COLUMN_WIDTHS = ["70%", ACCESS_ACTIONS_COLUMN_WIDTH] as const;
export const INVITATION_COLUMN_WIDTHS = ["28%", "14%", "16%", "18%", "18%"] as const;

/** @deprecated Use PROJECT_ACCESS_COLUMN_WIDTHS */
export const PROJECT_DIRECT_MEMBER_COLUMN_WIDTHS = PROJECT_ACCESS_COLUMN_WIDTHS;

export type AccessManagementColumnWidths = readonly string[];
