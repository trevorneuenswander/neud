type AlertProps = {
  children: React.ReactNode;
  variant?: "error" | "success" | "info";
};

const variantClasses = {
  error: "border-danger/30 bg-danger/10 text-danger",
  success: "border-success/30 bg-success/10 text-success",
  info: "border-primary/30 bg-primary/10 text-primary",
};

export function Alert({ children, variant = "info" }: AlertProps) {
  return (
    <p
      role="alert"
      className={`rounded-lg border px-3 py-2 text-sm ${variantClasses[variant]}`}
    >
      {children}
    </p>
  );
}
