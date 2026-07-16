"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/authorization";
import { getSiteOrigin } from "@/lib/auth/site-origin";
import type { AdminActionState } from "@/lib/access-requests/state";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function toAdminErrorMessage(error: { message?: string } | null): string {
  if (!error?.message) {
    return "Unable to complete this action. Please try again.";
  }

  const message = error.message.toLowerCase();

  if (message.includes("already been registered") || message.includes("already exists")) {
    return "A user with this email address already exists.";
  }

  if (message.includes("rate limit") || message.includes("too many requests")) {
    return "Too many attempts. Please wait and try again.";
  }

  return "Unable to complete this action. Please try again.";
}

async function getPendingRequest(requestId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("access_requests")
    .select("id, full_name, email, company, status")
    .eq("id", requestId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data;
}

export async function approveAccessRequest(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const { profile } = await requireAdmin();
  const requestId = String(formData.get("requestId") ?? "").trim();

  if (!requestId) {
    return { error: "Invalid request.", success: null };
  }

  const request = await getPendingRequest(requestId);

  if (!request) {
    return { error: "Request not found.", success: null };
  }

  if (request.status !== "pending") {
    return { error: "This request has already been reviewed.", success: null };
  }

  const admin = createAdminClient();
  const origin = await getSiteOrigin();
  const redirectTo = `${origin}/auth/confirm?next=${encodeURIComponent("/accept-invitation")}`;

  const { data: inviteData, error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(request.email, {
      redirectTo,
      data: {
        full_name: request.full_name,
        company: request.company,
      },
    });

  if (inviteError) {
    if (process.env.NODE_ENV === "development") {
      console.error("[approveAccessRequest] invite failed", inviteError.message);
    }

    return { error: toAdminErrorMessage(inviteError), success: null };
  }

  const invitedUserId = inviteData.user?.id;

  if (!invitedUserId) {
    return {
      error: "Invitation was sent but the user record could not be confirmed.",
      success: null,
    };
  }

  const { error: profileError } = await admin.from("profiles").upsert({
    id: invitedUserId,
    full_name: request.full_name,
    company: request.company,
    role: "user",
  });

  if (profileError) {
    if (process.env.NODE_ENV === "development") {
      console.error("[approveAccessRequest] profile upsert failed", profileError.message);
    }

    return { error: "Invitation sent but profile setup failed.", success: null };
  }

  const { error: updateError } = await admin
    .from("access_requests")
    .update({
      status: "approved",
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("status", "pending");

  if (updateError) {
    if (process.env.NODE_ENV === "development") {
      console.error("[approveAccessRequest] status update failed", updateError.message);
    }

    return {
      error: "Invitation sent but the request status could not be updated.",
      success: null,
    };
  }

  revalidatePath("/admin/access-requests");

  return {
    error: null,
    success: `Invitation sent to ${request.email}.`,
  };
}

export async function rejectAccessRequest(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const { profile } = await requireAdmin();
  const requestId = String(formData.get("requestId") ?? "").trim();

  if (!requestId) {
    return { error: "Invalid request.", success: null };
  }

  const request = await getPendingRequest(requestId);

  if (!request) {
    return { error: "Request not found.", success: null };
  }

  if (request.status !== "pending") {
    return { error: "This request has already been reviewed.", success: null };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("access_requests")
    .update({
      status: "rejected",
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("status", "pending");

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[rejectAccessRequest]", error.message);
    }

    return { error: "Unable to reject this request.", success: null };
  }

  revalidatePath("/admin/access-requests");

  return {
    error: null,
    success: `Request from ${request.email} was rejected.`,
  };
}
