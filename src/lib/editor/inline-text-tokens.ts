import type { InlineTextToken } from "./phase4-types";
import { listReadyDataLeaves } from "./graphic-data-registry";
import { normalizeDataBindingPath } from "./graphic-data-registry";

const LEAVES = listReadyDataLeaves();

function labelForBinding(binding: string): string {
  const normalized = normalizeDataBindingPath(binding);
  const hit = LEAVES.find((leaf) => leaf.binding === normalized || leaf.path === normalized);
  return hit?.label ?? binding;
}

/** Parse expression-lite "Lot {now.title} — static" into tokens (chips). */
export function parseExpressionToTokens(expression: string): InlineTextToken[] {
  const tokens: InlineTextToken[] = [];
  const re = /\{([^}]+)\}/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(expression)) !== null) {
    if (match.index > last) {
      tokens.push({ kind: "text", value: expression.slice(last, match.index) });
    }
    const raw = match[1]!.trim();
    const binding = normalizeDataBindingPath(raw) || raw;
    tokens.push({ kind: "binding", binding, label: labelForBinding(binding) });
    last = match.index + match[0].length;
  }
  if (last < expression.length) {
    tokens.push({ kind: "text", value: expression.slice(last) });
  }
  if (tokens.length === 0 && expression) {
    tokens.push({ kind: "text", value: expression });
  }
  return tokens;
}

export function tokensToExpression(tokens: InlineTextToken[]): string {
  return tokens
    .map((token) => (token.kind === "text" ? token.value : `{${token.binding}}`))
    .join("");
}

export function resolveExpressionText(
  tokens: InlineTextToken[],
  resolveBinding: (binding: string) => string,
): string {
  return tokens
    .map((token) =>
      token.kind === "text" ? token.value : resolveBinding(token.binding),
    )
    .join("");
}

export function bindingFromChipLabel(label: string): string {
  const hit = LEAVES.find((leaf) => leaf.label === label);
  return hit?.binding ?? normalizeDataBindingPath(label) ?? label;
}
