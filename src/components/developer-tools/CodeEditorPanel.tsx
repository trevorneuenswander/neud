"use client";

type CodeEditorPanelProps = {
  value: string;
  language?: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  minHeight?: number;
};

export function CodeEditorPanel({
  value,
  onChange,
  readOnly = false,
  minHeight = 420,
}: CodeEditorPanelProps) {
  return (
    <textarea
      value={value}
      readOnly={readOnly}
      spellCheck={false}
      onChange={(event) => onChange(event.target.value)}
      className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm leading-6 text-foreground outline-none focus:border-primary"
      style={{ minHeight }}
    />
  );
}
