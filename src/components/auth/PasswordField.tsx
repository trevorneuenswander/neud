"use client";

import { useId, useState } from "react";

type PasswordFieldProps = {
  id: string;
  label: string;
  name: string;
  autoComplete?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
};

export function PasswordField({
  id,
  label,
  name,
  autoComplete = "new-password",
  value,
  onChange,
  disabled = false,
  inputRef,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const hintId = useId();

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="relative mt-2">
        <input
          ref={inputRef}
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={hintId}
          className="block w-full rounded-md border border-border bg-surface-raised px-3 py-2 pr-16 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
        />
        <button
          id={hintId}
          type="button"
          onClick={() => setVisible((current) => !current)}
          disabled={disabled}
          className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );
}
