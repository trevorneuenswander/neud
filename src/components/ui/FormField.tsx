type FormFieldProps = {
  id: string;
  label: string;
  name: string;
  type?: "email" | "password" | "text";
  autoComplete?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  inputRef?: React.Ref<HTMLInputElement>;
};

export function FormField({
  id,
  label,
  name,
  type = "text",
  autoComplete,
  required = true,
  disabled = false,
  placeholder,
  value,
  defaultValue,
  onChange,
  inputRef,
}: FormFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      <input
        ref={inputRef}
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        className="mt-2 block w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
      />
    </div>
  );
}
