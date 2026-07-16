type AuthFormFieldProps = {
  id: string;
  label: string;
  name: string;
  type?: "email" | "password" | "text";
  autoComplete?: string;
  required?: boolean;
  value?: string;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  inputRef?: React.Ref<HTMLInputElement>;
};

export function AuthFormField({
  id,
  label,
  name,
  type = "text",
  autoComplete,
  required = true,
  value,
  onChange,
  inputRef,
}: AuthFormFieldProps) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-medium text-zinc-900 dark:text-zinc-50"
      >
        {label}
      </label>
      <input
        ref={inputRef}
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        value={value}
        onChange={onChange}
        className="mt-2 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none transition-colors focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-500 dark:focus:ring-zinc-800"
      />
    </div>
  );
}

type TextAreaFieldProps = {
  id: string;
  label: string;
  name: string;
  required?: boolean;
  value?: string;
  onChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
};

export function TextAreaField({
  id,
  label,
  name,
  required = false,
  value,
  onChange,
}: TextAreaFieldProps) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-medium text-zinc-900 dark:text-zinc-50"
      >
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        rows={4}
        required={required}
        value={value}
        onChange={onChange}
        className="mt-2 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none transition-colors focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-500 dark:focus:ring-zinc-800"
      />
    </div>
  );
}
