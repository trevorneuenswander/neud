import { createAdminClient } from "@/lib/supabase/admin";

export type UserAuditEventType =
  | "user.created"
  | "user.invited"
  | "user.role.changed"
  | "user.project.assigned"
  | "user.project.removed"
  | "user.deactivated"
  | "user.deleted";

type AuditMetadata = Record<string, unknown>;

export async function recordUserAuditEvent(input: {
  actorUserId: string;
  targetUserId?: string | null;
  eventType: UserAuditEventType;
  metadata?: AuditMetadata;
  result?: "success" | "failure";
}) {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("auth_audit_log").insert({
      user_id: input.actorUserId,
      event_type: input.eventType,
      metadata: {
        actorUserId: input.actorUserId,
        targetUserId: input.targetUserId ?? null,
        result: input.result ?? "success",
        timestamp: new Date().toISOString(),
        ...(input.metadata ?? {}),
      },
    });

    if (error && process.env.NODE_ENV === "development") {
      console.error("[recordUserAuditEvent]", error.message);
    }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[recordUserAuditEvent]", error);
    }
  }
}
