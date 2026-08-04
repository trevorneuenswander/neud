export type PasswordStrengthLevel = "weak" | "fair" | "good" | "strong";

export type PasswordStrength = {
  score: number;
  level: PasswordStrengthLevel;
  checks: {
    minLength: boolean;
    hasLowercase: boolean;
    hasUppercase: boolean;
    hasNumber: boolean;
    hasSpecial: boolean;
  };
};

export function evaluatePasswordStrength(password: string): PasswordStrength {
  const checks = {
    minLength: password.length >= 8,
    hasLowercase: /[a-z]/.test(password),
    hasUppercase: /[A-Z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSpecial: /[^A-Za-z0-9]/.test(password),
  };

  const score = Object.values(checks).filter(Boolean).length;

  let level: PasswordStrengthLevel = "weak";
  if (score >= 5) {
    level = "strong";
  } else if (score >= 4) {
    level = "good";
  } else if (score >= 3) {
    level = "fair";
  }

  return { score, level, checks };
}

export function getPasswordStrengthLabel(level: PasswordStrengthLevel): string {
  switch (level) {
    case "weak":
      return "Weak";
    case "fair":
      return "Fair";
    case "good":
      return "Good";
    case "strong":
      return "Strong";
  }
}

export function getPasswordStrengthBarClass(level: PasswordStrengthLevel): string {
  switch (level) {
    case "weak":
      return "bg-danger";
    case "fair":
      return "bg-warning";
    case "good":
      return "bg-primary";
    case "strong":
      return "bg-success";
  }
}
