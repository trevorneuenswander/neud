import type { OperatorControl, OperatorSection } from "./phase4-types";

export type OperatorPreviewValues = Record<string, string | number | boolean>;

export function defaultOperatorValues(sections: OperatorSection[]): OperatorPreviewValues {
  const values: OperatorPreviewValues = {};
  for (const section of sections) {
    for (const control of section.controls) {
      if (control.controlType === "toggle") {
        values[control.id] = false;
      } else if (control.controlType === "number") {
        values[control.id] = control.validation?.min ?? 0;
      } else {
        values[control.id] = "";
      }
    }
  }
  return values;
}

export function validateOperatorControl(
  control: OperatorControl,
  value: string | number | boolean,
): string | null {
  const v = control.validation;
  if (!v) return null;
  if (v.required && (value === "" || value == null)) {
    return `${control.label} is required`;
  }
  if (control.controlType === "text" && typeof value === "string") {
    if (v.minLength != null && value.length < v.minLength) {
      return `${control.label} is too short`;
    }
    if (v.maxLength != null && value.length > v.maxLength) {
      return `${control.label} is too long`;
    }
    if (v.pattern) {
      try {
        if (!new RegExp(v.pattern).test(value)) {
          return `${control.label} has invalid format`;
        }
      } catch {
        return null;
      }
    }
  }
  if (control.controlType === "number" && typeof value === "number") {
    if (v.min != null && value < v.min) return `${control.label} must be ≥ ${v.min}`;
    if (v.max != null && value > v.max) return `${control.label} must be ≤ ${v.max}`;
  }
  return null;
}
