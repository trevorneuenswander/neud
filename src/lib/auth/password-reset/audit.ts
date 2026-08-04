import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type PasswordResetAuditOutcome =
  | "sent"
  | "rate_limited"
  | "no_user"
  | "email_failed"
  | "email_unconfigured"
  | "validated"
  | "invalid"
  | "expired"
  | "used"
  | "completed"
  | "complete_failed";

type PasswordResetAuditMetadata = Record<string, unknown>;

export async function recordPasswordResetAuditEvent(input: {
  eventType:
    | "password_reset.request"
    | "password_reset.validate"
    | "password_reset.complete";
  userId?: string | null;
  outcome: PasswordResetAuditOutcome;
  metadata?: PasswordResetAuditMetadata;
}) {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("auth_audit_log").insert({
      user_id: input.userId ?? null,
      event_type: input.eventType,
      metadata: {
        outcome: input.outcome,
        timestamp: new Date().toISOString(),
        ...(input.metadata ?? {}),
      },
    });

    if (error && process.env.NODE_ENV === "development") {
      console.error("[recordPasswordResetAuditEvent]", error.message);
    }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[recordPasswordResetAuditEvent]", error);
    }
  }
}

export async function countPasswordResetRequests(input: {
  emailHash?: string;
  ipHash?: string;
  sinceIso: string;
}): Promise<{ emailCount: number; ipCount: number }> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("auth_audit_log")
      .select("metadata")
      .eq("event_type", "password_reset.request")
      .gte("created_at", input.sinceIso);

    if (error || !data) {
      return { emailCount: 0, ipCount: 0 };
    }

    let emailCount = 0;
    let ipCount = 0;

    for (const row of data) {
      const metadata = row.metadata as Record<string, unknown> | null;
      if (!metadata) {
        continue;
      }

      if (input.emailHash && metadata.emailHash === input.emailHash) {
        emailCount += 1;
      }

      if (input.ipHash && metadata.ipHash === input.ipHash) {
        ipCount += 1;
      }
    }

    return { emailCount, ipCount };
  } catch {
    return { emailCount: 0, ipCount: 0 };
  }
}
