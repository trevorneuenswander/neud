import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildFullNameFromParts,
  normalizePhoneForProfile,
  type InvitationProfileFailureStage,
} from "@/lib/auth/invitation-acceptance-profile";

export type InvitedProfileUpsertResult =
  | {
      ok: true;
      profileUpdateAttempted: true;
      profileUpdateSucceeded: true;
      profileUpsertUsed: boolean;
      existingProfilePresent: boolean;
      existingFullNamePresent: boolean;
      existingPhonePresent: boolean;
      firstInvitationProfileFailureStage: "none";
    }
  | {
      ok: false;
      profileUpdateAttempted: boolean;
      profileUpdateSucceeded: false;
      profileUpsertUsed: boolean;
      existingProfilePresent: boolean;
      existingFullNamePresent: boolean;
      existingPhonePresent: boolean;
      firstInvitationProfileFailureStage: InvitationProfileFailureStage;
      userMessage: string;
    };

export async function upsertInvitedUserProfile(
  supabase: SupabaseClient,
  input: {
    firstName: string;
    lastName: string;
    phone: string;
  },
): Promise<InvitedProfileUpsertResult> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return {
      ok: false,
      profileUpdateAttempted: false,
      profileUpdateSucceeded: false,
      profileUpsertUsed: false,
      existingProfilePresent: false,
      existingFullNamePresent: false,
      existingPhonePresent: false,
      firstInvitationProfileFailureStage: "unauthenticated",
      userMessage: "Sign in to accept this invitation.",
    };
  }

  const userId = userData.user.id;
  const fullName = buildFullNameFromParts(input.firstName, input.lastName);
  const phoneNumber = normalizePhoneForProfile(input.phone);

  const { data: existing, error: loadError } = await supabase
    .from("profiles")
    .select("id, full_name, phone_number, role, email, team")
    .eq("id", userId)
    .maybeSingle();

  if (loadError) {
    return {
      ok: false,
      profileUpdateAttempted: false,
      profileUpdateSucceeded: false,
      profileUpsertUsed: false,
      existingProfilePresent: false,
      existingFullNamePresent: false,
      existingPhonePresent: false,
      firstInvitationProfileFailureStage: "profile_load_failed",
      userMessage: "Unable to load your profile. Try again.",
    };
  }

  const existingProfilePresent = Boolean(existing?.id);
  const existingFullNamePresent = Boolean(existing?.full_name?.trim());
  const existingPhonePresent = Boolean(existing?.phone_number?.trim());

  const profileUpsertUsed = !existingProfilePresent;
  const patch = {
    full_name: fullName,
    phone_number: phoneNumber,
  };

  if (existingProfilePresent) {
    const { error: updateError } = await supabase
      .from("profiles")
      .update(patch)
      .eq("id", userId);

    if (updateError) {
      return {
        ok: false,
        profileUpdateAttempted: true,
        profileUpdateSucceeded: false,
        profileUpsertUsed: false,
        existingProfilePresent,
        existingFullNamePresent,
        existingPhonePresent,
        firstInvitationProfileFailureStage: "profile_update_failed",
        userMessage: "Unable to save your profile. Try again.",
      };
    }
  } else {
    const { error: insertError } = await supabase.from("profiles").upsert(
      {
        id: userId,
        email: userData.user.email ?? null,
        role: "user",
        ...patch,
      },
      { onConflict: "id" },
    );

    if (insertError) {
      return {
        ok: false,
        profileUpdateAttempted: true,
        profileUpdateSucceeded: false,
        profileUpsertUsed: true,
        existingProfilePresent: false,
        existingFullNamePresent: false,
        existingPhonePresent: false,
        firstInvitationProfileFailureStage: "profile_update_failed",
        userMessage: "Unable to save your profile. Try again.",
      };
    }
  }

  await supabase.auth.updateUser({
    data: {
      full_name: fullName,
    },
  });

  return {
    ok: true,
    profileUpdateAttempted: true,
    profileUpdateSucceeded: true,
    profileUpsertUsed,
    existingProfilePresent,
    existingFullNamePresent,
    existingPhonePresent,
    firstInvitationProfileFailureStage: "none",
  };
}
