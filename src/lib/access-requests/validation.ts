const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_FULL_NAME_LENGTH = 120;
const MAX_COMPANY_LENGTH = 120;
const MAX_COMMENTS_LENGTH = 1000;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateAccessRequestEmail(email: string): string | null {
  const normalized = normalizeEmail(email);

  if (!normalized) {
    return "Work email is required.";
  }

  if (!EMAIL_PATTERN.test(normalized)) {
    return "Enter a valid email address.";
  }

  return null;
}

export function validateFullName(fullName: string): string | null {
  const trimmed = fullName.trim();

  if (!trimmed) {
    return "Full name is required.";
  }

  if (trimmed.length > MAX_FULL_NAME_LENGTH) {
    return `Full name must be ${MAX_FULL_NAME_LENGTH} characters or fewer.`;
  }

  return null;
}

export function validateCompany(company: string): string | null {
  const trimmed = company.trim();

  if (!trimmed) {
    return "Company is required.";
  }

  if (trimmed.length > MAX_COMPANY_LENGTH) {
    return `Company must be ${MAX_COMPANY_LENGTH} characters or fewer.`;
  }

  return null;
}

export function validateComments(comments: string): string | null {
  const trimmed = comments.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.length > MAX_COMMENTS_LENGTH) {
    return `Comments must be ${MAX_COMMENTS_LENGTH} characters or fewer.`;
  }

  return null;
}
