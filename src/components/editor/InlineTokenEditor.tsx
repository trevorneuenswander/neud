"use client";

import { useMemo } from "react";
import { listReadyDataLeaves } from "@/lib/editor/graphic-data-registry";
import {
  parseExpressionToTokens,
  tokensToExpression,
} from "@/lib/editor/inline-text-tokens";
import type { InlineTextToken } from "@/lib/editor/phase4-types";

type InlineTokenEditorProps = {
  expression: string;
  onChange: (expression: string, textMode: "expression") => void;
};

const LEAVES = listReadyDataLeaves();

export function InlineTokenEditor({ expression, onChange }: InlineTokenEditorProps) {
  const tokens = useMemo(() => parseExpressionToTokens(expression), [expression]);

  function commit(next: InlineTextToken[]) {
    onChange(tokensToExpression(next), "expression");
  }

  return (
    <div className="space-y-2">
      <div className="flex min-h-[2.5rem] flex-wrap items-center gap-1 rounded border border-neutral-700 bg-neutral-950 p-2">
        {tokens.length === 0 ? (
          <span className="text-neutral-500">Add static text and data tokens</span>
        ) : (
          tokens.map((token, index) =>
            token.kind === "text" ? (
              <input
                key={`t-${index}`}
                className="min-w-[4rem] flex-1 rounded border border-neutral-800 bg-neutral-900 px-1.5 py-0.5"
                value={token.value}
                onChange={(event) => {
                  const next = [...tokens];
                  next[index] = { kind: "text", value: event.target.value };
                  commit(next);
                }}
              />
            ) : (
              <span
                key={`b-${index}`}
                className="inline-flex items-center gap-1 rounded-full bg-sky-950 px-2 py-0.5 text-[10px] text-sky-100 ring-1 ring-sky-800"
              >
                {token.label ?? token.binding}
                <button
                  type="button"
                  className="text-sky-300 hover:text-white"
                  aria-label="Remove token"
                  onClick={() => commit(tokens.filter((_, i) => i !== index))}
                >
                  ×
                </button>
              </span>
            ),
          )
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          className="rounded border border-neutral-700 px-2 py-0.5"
          onClick={() => commit([...tokens, { kind: "text", value: " " }])}
        >
          + Text
        </button>
        {LEAVES.slice(0, 8).map((leaf) => (
          <button
            key={leaf.binding}
            type="button"
            className="rounded border border-neutral-700 px-2 py-0.5 text-[10px]"
            onClick={() =>
              commit([
                ...tokens,
                { kind: "binding", binding: leaf.binding, label: leaf.label },
              ])
            }
          >
            + {leaf.label}
          </button>
        ))}
      </div>
    </div>
  );
}
