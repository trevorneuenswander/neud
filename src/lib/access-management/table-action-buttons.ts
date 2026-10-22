/** Shared far-right Actions column width for Project Access user + team tables. */
export const ACCESS_ACTIONS_COLUMN_WIDTH = "18%";

/**
 * Shared visible height for Manage Team role select + Remove button.
 * box-border + min/max keep native <select> and Button at the same 32px.
 */
export const ACCESS_TABLE_ACTION_CONTROL_HEIGHT_CLASS =
  "box-border h-8 min-h-8 max-h-8 shrink-0";

/** Equal-height access table action buttons (Users, Teams, Project Access). */
export const ACCESS_TABLE_ACTION_BUTTON_CLASS = [
  "inline-flex",
  ACCESS_TABLE_ACTION_CONTROL_HEIGHT_CLASS,
  "min-w-[5.5rem] items-center justify-center px-3 text-xs leading-none",
].join(" ");

/** Manage Team role dropdown — matches ACCESS_TABLE_ACTION_BUTTON_CLASS height. */
export const ACCESS_TABLE_ACTION_SELECT_CLASS = [
  ACCESS_TABLE_ACTION_CONTROL_HEIGHT_CLASS,
  "rounded-md border border-border bg-surface-raised px-2 py-0 text-sm leading-none",
].join(" ");
