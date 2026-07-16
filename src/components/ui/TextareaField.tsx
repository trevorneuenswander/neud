type TextareaFieldProps = {
  id: string;
  label: string;
  name: string;
  required?: boolean;
  disabled?: boolean;
  value?: string;
  onChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
};

export function TextareaField({
  id,
  label,
  name,
  required = false,
  disabled = false,
  value,
  onChange,
}: TextareaFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        rows={4}
        required={required}
        disabled={disabled}
        value={value}
        onChange={onChange}
        className="mt-2 block w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
      />
    </div>
  );
}
