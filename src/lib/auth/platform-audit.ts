// ============================================================
// Platform audit log writer (Ciclo 003-R).
//
// Append-only via service-role. Never stores tokens, cookies,
// message bodies, or secrets. Metadata must be pre-sanitized by
// the caller (reason strings, counts, ids only).
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";

export type PlatformAuditAction =
  | "organization.suspended"
  | "organization.activated"
  | "platform_admin.created"
  | "platform_admin.suspended"
  | "platform_admin.revoked";

export interface WritePlatformAuditParams {
  admin: SupabaseClient;
  platformAdminId: string;
  actorUserId: string;
  action: PlatformAuditAction;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

const BLOCKED_META_KEYS = new Set([
  "token",
  "access_token",
  "refresh_token",
  "cookie",
  "password",
  "secret",
  "service_role",
  "authorization",
]);

export function sanitizeAuditMetadata(
  input: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!input) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (BLOCKED_META_KEYS.has(k.toLowerCase())) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v === null) {
      out[k] = typeof v === "string" ? v.slice(0, 500) : v;
    }
  }
  return out;
}

export async function writePlatformAuditLog(
  params: WritePlatformAuditParams,
): Promise<void> {
  const { error } = await params.admin.from("platform_audit_logs").insert({
    platform_admin_id: params.platformAdminId,
    actor_user_id: params.actorUserId,
    action: params.action,
    target_type: params.targetType,
    target_id: params.targetId ?? null,
    metadata: sanitizeAuditMetadata(params.metadata),
    ip_address: params.ipAddress ?? null,
    user_agent: params.userAgent ? params.userAgent.slice(0, 300) : null,
  });
  if (error) {
    // Audit failure must not silently succeed the parent action without a
    // log — but we still surface it so the route can decide.
    console.error("[writePlatformAuditLog] insert error:", error);
    throw new Error("Failed to write audit log");
  }
}
