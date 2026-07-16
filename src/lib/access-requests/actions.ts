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

function toAccessRequestErrorMessage(error: { code?: string; message?: string }) {
  if (error.code === "23505") {
    return "A pending request already exists for this email address.";
  }

  return "Unable to submit your request. Please try again.";
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

  const admin = createAdminClient();
  const normalizedEmail = normalizeEmail(email);

  const { error } = await admin.from("access_requests").insert({
    full_name: fullName.trim(),
    email: normalizedEmail,
    company: company.trim(),
    comments: comments.trim() || null,
    status: "pending",
  });

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[submitAccessRequest]", error.code, error.message);
    }

    return { error: toAccessRequestErrorMessage(error) };
  }

  redirect("/request-access/submitted");
}
