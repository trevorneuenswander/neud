import { ACCESS_ACTIONS_COLUMN_WIDTH } from "@/lib/access-management/table-action-buttons";

export const TEAM_COLUMN_WIDTHS = ["30%", "12%", "12%", "16%", "18%"] as const;
/** Member / Email / Role / Actions — Actions stays wide enough for role+Remove on one line. */
export const TEAM_MEMBER_COLUMN_WIDTHS = ["24%", "28%", "14%", "34%"] as const;
export const USER_COLUMN_WIDTHS = ["16%", "20%", "14%", "16%", "16%", "14%"] as const;
export const USER_COLUMN_WIDTHS_WITH_DETAILS = [
  "18%",
  "18%",
  "18%",
  "16%",
  "14%",
  "10%",
] as const;
export const PROJECT_ACCESS_COLUMN_WIDTHS = [
  "22%",
  "18%",
  "22%",
  "16%",
  ACCESS_ACTIONS_COLUMN_WIDTH,
] as const;

export const PROJECT_TEAM_COLUMN_WIDTHS = ["70%", ACCESS_ACTIONS_COLUMN_WIDTH] as const;
export const INVITATION_COLUMN_WIDTHS = ["28%", "14%", "16%", "18%", "18%"] as const;

/** @deprecated Use PROJECT_ACCESS_COLUMN_WIDTHS */
export const PROJECT_DIRECT_MEMBER_COLUMN_WIDTHS = PROJECT_ACCESS_COLUMN_WIDTHS;

export type AccessManagementColumnWidths = readonly string[];
