export type ValidationIssue = {
  severity: "error" | "warning";
  message: string;
  line?: number;
};

export type ValidationResult = {
  ok: boolean;
  status: "valid" | "invalid";
  issues: ValidationIssue[];
};
