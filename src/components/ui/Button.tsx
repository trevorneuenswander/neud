import Link from "next/link";

type ButtonProps = {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  href?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
};

const variantClasses = {
  primary:
    "bg-primary text-white hover:bg-primary/90 disabled:bg-primary/50",
  secondary:
    "border border-border bg-surface-raised text-foreground hover:bg-surface disabled:opacity-50",
  ghost:
    "text-muted hover:bg-surface-raised hover:text-foreground disabled:opacity-50",
  danger:
    "border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20 disabled:opacity-50",
};

const sizeClasses = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  href,
  type = "button",
  disabled = false,
  className = "",
}: ButtonProps) {
  const classes = `inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none cursor-pointer disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;

  if (href && !disabled) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button type={type} disabled={disabled} className={classes}>
      {children}
    </button>
  );
}
