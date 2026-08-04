"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";
import { shouldUseLocalData } from "@/lib/local/mode";

export type ProfileActionState = {
  error: string | null;
  success: string | null;
};

const PHONE_PATTERN = /^[\d+\-(). xXextEXT#]{0,40}$/;

export async function updateOwnProfile(
  _prevState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  if (shouldUseLocalData()) {
    return { error: "Profile editing requires hosted authentication.", success: null };
  }

  const { profile } = await requireUser("/login");
  const fullName = String(formData.get("fullName") ?? "").trim();
  const phoneNumber = String(formData.get("phoneNumber") ?? "").trim();
  const team = String(formData.get("team") ?? "").trim();

  if (phoneNumber && !PHONE_PATTERN.test(phoneNumber)) {
    return { error: "Enter a valid phone number.", success: null };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName || null,
      phone_number: phoneNumber || null,
      team: team || null,
    })
    .eq("id", profile.id);

  if (error) {
    return { error: error.message, success: null };
  }

  revalidatePath("/profile");
  return { error: null, success: "Profile updated." };
}
