export function toAuthErrorMessage(error: { message?: string } | null): string {
  if (!error?.message) {
    return "Something went wrong. Please try again.";
  }

  const message = error.message.toLowerCase();

  if (message.includes("invalid login credentials")) {
    return "Incorrect email or password.";
  }

  if (message.includes("invalid api key") || message.includes("invalid jwt")) {
    return "NEUD could not reach Supabase with a valid publishable key. Reinstall from a current release build or contact support.";
  }

  if (message.includes("fetch failed") || message.includes("failed to fetch")) {
    return "Unable to reach Supabase. Check your internet connection and try again.";
  }

  if (message.includes("user already registered")) {
    return "An account with this email already exists.";
  }

  if (message.includes("email not confirmed")) {
    return "Confirm your email address before logging in.";
  }

  if (message.includes("password should be at least")) {
    return "Password must be at least 8 characters.";
  }

  if (message.includes("signup requires a valid password")) {
    return "Enter a valid password.";
  }

  if (message.includes("rate limit") || message.includes("too many requests")) {
    return "Too many attempts. Please wait and try again.";
  }

  if (message.includes("email address invalid")) {
    return "Enter a valid email address.";
  }

  if (message.includes("token has expired") || message.includes("otp expired")) {
    return "This link has expired. Request a new one and try again.";
  }

  if (message.includes("invalid") && message.includes("token")) {
    return "This link is invalid. Request a new one and try again.";
  }

  return "Something went wrong. Please try again.";
}
