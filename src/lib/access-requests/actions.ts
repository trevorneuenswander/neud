"use server";

import { redirect } from "next/navigation";
import {
  normalizeEmail,
  validateAccessRequestEmail,
  validateComments,
  validateCompany,
  validateFullName,
} from "@/lib/access-requests/validation";
import type { AccessRequestActionState } from "@/lib/access-requests/state";
import { createAdminClient } from "@/lib/supabase/admin";

const GENERIC_ERROR =
  "Unable to submit your request. Please try again.";

function toAccessRequestErrorMessage(error: {
  code?: string;
  message?: string;
}) {
  if (error.code === "23505") {
    return "An access request for this email is already pending.";
  }

  return GENERIC_ERROR;
}

function logAccessRequestInsertError(error: {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.error("Access request insert failed", {
    message: error.message,
    code: error.code,
    details: error.details,
    hint: error.hint,
  });

  if (error.code === "42P01") {
    console.error(
      "[submitAccessRequest] Table public.access_requests does not exist. Apply supabase/migrations/001_access_requests_and_profiles.sql.",
    );
  }

  if (error.code === "23514") {
    console.error(
      "[submitAccessRequest] Check constraint violation on access_requests insert.",
    );
  }

  if (error.code === "42501") {
    console.error(
      "[submitAccessRequest] Permission denied. Verify SUPABASE_SERVICE_ROLE_KEY is set correctly.",
    );
  }
}

export async function submitAccessRequest(
  _prevState: AccessRequestActionState,
  formData: FormData,
): Promise<AccessRequestActionState> {
  const honeypot = String(formData.get("website") ?? "").trim();

  if (honeypot) {
    redirect("/request-access/submitted");
  }

  const fullName = String(formData.get("fullName") ?? "");
  const email = String(formData.get("email") ?? "");
  const company = String(formData.get("company") ?? "");
  const comments = String(formData.get("comments") ?? "");

  const fullNameError = validateFullName(fullName);
  if (fullNameError) {
    return { error: fullNameError };
  }

  const emailError = validateAccessRequestEmail(email);
  if (emailError) {
    return { error: emailError };
  }

  const companyError = validateCompany(company);
  if (companyError) {
    return { error: companyError };
  }

  const commentsError = validateComments(comments);
  if (commentsError) {
    return { error: commentsError };
  }

  let admin;

  try {
    admin = createAdminClient();
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error(
        "Access request insert failed",
        error instanceof Error ? error.message : error,
      );
    }

    return { error: GENERIC_ERROR };
  }

  const normalizedEmail = normalizeEmail(email);

  const { error } = await admin.from("access_requests").insert({
    full_name: fullName.trim(),
    email: normalizedEmail,
    company: company.trim(),
    comments: comments.trim() || null,
    status: "pending",
  });

  if (error) {
    logAccessRequestInsertError(error);
    return { error: toAccessRequestErrorMessage(error) };
  }

  redirect("/request-access/submitted");
}
