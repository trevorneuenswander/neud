"use client";

import {
  evaluatePasswordStrength,
  getPasswordStrengthBarClass,
  getPasswordStrengthLabel,
} from "@/lib/auth/password-strength";
import { validatePassword } from "@/lib/auth/validation";

type PasswordStrengthIndicatorProps = {
  password: string;
};

export function PasswordStrengthIndicator({
  password,
}: PasswordStrengthIndicatorProps) {
  const strength = evaluatePasswordStrength(password);
  const validationError = password ? validatePassword(password) : null;
  const widthPercent = `${(strength.score / 5) * 100}%`;

  return (
    <div className="space-y-2" aria-live="polite">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">Password strength</span>
        <span className="font-medium text-foreground">
          {password ? getPasswordStrengthLabel(strength.level) : "—"}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-border">
        <div
          className={`h-full transition-all ${getPasswordStrengthBarClass(strength.level)}`}
          style={{ width: password ? widthPercent : "0%" }}
        />
      </div>
      <ul className="space-y-1 text-xs text-muted">
        <li className={strength.checks.minLength ? "text-success" : ""}>
          At least 8 characters
        </li>
        <li className={strength.checks.hasLowercase ? "text-success" : ""}>
          One lowercase letter
        </li>
        <li className={strength.checks.hasUppercase ? "text-success" : ""}>
          One uppercase letter
        </li>
        <li className={strength.checks.hasNumber ? "text-success" : ""}>
          One number
        </li>
        <li className={strength.checks.hasSpecial ? "text-success" : ""}>
          One special character
        </li>
      </ul>
      {validationError ? (
        <p className="text-xs text-danger">{validationError}</p>
      ) : null}
    </div>
  );
}
