export type ActivityCsvRow = {
  projectName: string;
  user: string;
  description: string;
  createdAt?: string;
  eventType?: string;
};

function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function activityRowsToCsv(rows: ActivityCsvRow[], includeDate = true): string {
  const includeEventType = rows.some((row) => Boolean(row.eventType));
  const headers = includeDate
    ? includeEventType
      ? ["Timestamp", "User", "Event Type", "Project", "Description"]
      : ["Project Name", "User", "Description", "Date"]
    : includeEventType
      ? ["User", "Event Type", "Project", "Description"]
      : ["Project Name", "User", "Description"];

  const lines = [
    headers.join(","),
    ...rows.map((row) => {
      if (includeDate && includeEventType) {
        return [
          escapeCsvField(row.createdAt ?? ""),
          escapeCsvField(row.user),
          escapeCsvField(row.eventType ?? ""),
          escapeCsvField(row.projectName),
          escapeCsvField(row.description),
        ].join(",");
      }
      const fields = [
        escapeCsvField(row.projectName),
        escapeCsvField(row.user),
        escapeCsvField(row.description),
      ];
      if (includeDate) {
        fields.push(escapeCsvField(row.createdAt ?? ""));
      }
      return fields.join(",");
    }),
  ];

  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function sanitizeActivityFilenameSegment(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "project";
}

export function buildActivityCsvFilename(scope: "global" | "project", projectSlug?: string): string {
  const now = new Date();
  const datePart = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  const timePart = [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");

  if (scope === "project") {
    const slug = sanitizeActivityFilenameSegment(projectSlug ?? "project");
    return `${slug}-activity-${datePart}-${timePart}.csv`;
  }

  return `neud-activity-${datePart}-${timePart}.csv`;
}

export function downloadActivityCsv(rows: ActivityCsvRow[], filename: string, includeDate = true): void {
  const csv = activityRowsToCsv(rows, includeDate);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
