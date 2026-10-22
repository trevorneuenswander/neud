/**
 * Declarative visibility / conditional style evaluation (no JS).
 */

import type {
  EditableConditionOperator,
  EditableConditionalStyleRule,
  EditableLayerStyle,
  EditableVisibilityCondition,
} from "./editable-graphic-types";

export function resolveDataValue(
  data: Record<string, unknown>,
  binding: string | undefined | null,
): unknown {
  if (!binding) return undefined;
  const path = binding.startsWith("schedule.") ? binding.slice("schedule.".length) : binding;
  const parts = path.split(".").filter(Boolean);
  let current: unknown = data;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function evaluateCondition(
  data: Record<string, unknown>,
  condition: EditableVisibilityCondition | null | undefined,
): boolean {
  if (!condition) return true;
  const raw = resolveDataValue(data, condition.binding);
  const asString = raw == null ? "" : String(raw);
  const empty = asString.trim() === "";
  const rhs = condition.value ?? "";

  switch (condition.operator) {
    case "isEmpty":
      return empty;
    case "isNotEmpty":
      return !empty;
    case "equals":
      return asString === rhs;
    case "doesNotEqual":
      return asString !== rhs;
    case "greaterThan": {
      const a = Number(asString);
      const b = Number(rhs);
      return Number.isFinite(a) && Number.isFinite(b) && a > b;
    }
    case "lessThan": {
      const a = Number(asString);
      const b = Number(rhs);
      return Number.isFinite(a) && Number.isFinite(b) && a < b;
    }
    default:
      return true;
  }
}

export function applyConditionalStyles(
  data: Record<string, unknown>,
  rules: EditableConditionalStyleRule[] | undefined | null,
  baseStyle: EditableLayerStyle,
  baseOpacity: number,
): { style: EditableLayerStyle; opacity: number } {
  let style = { ...baseStyle };
  let opacity = baseOpacity;
  for (const rule of rules ?? []) {
    const ok = evaluateCondition(data, {
      binding: rule.binding,
      operator: rule.operator,
      value: rule.value,
    });
    if (!ok) continue;
    if (rule.style.color != null) style = { ...style, color: rule.style.color };
    if (rule.style.fill != null) style = { ...style, fill: rule.style.fill };
    if (typeof rule.style.opacity === "number") opacity = rule.style.opacity;
  }
  return { style, opacity };
}

export const CONDITION_OPERATOR_LABELS: Record<EditableConditionOperator, string> = {
  equals: "Equals",
  doesNotEqual: "Does not equal",
  isEmpty: "Is empty",
  isNotEmpty: "Is not empty",
  greaterThan: "Greater than",
  lessThan: "Less than",
};
