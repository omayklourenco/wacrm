// ============================================================
// Platform Super Admin authorization (Ciclo 003-R).
//
// Completely separate from tenant AccountRole / membership.
// NEVER derive platform privileges from owner/admin of an account.
// NEVER consult active_account_id for platform authorization.
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/flows/admin-client";
import {
  ForbiddenError,
  UnauthorizedError,
} from "@/lib/auth/account";

export type PlatformAdminRole = "super_admin" | "platform_admin";

export const PLATFORM_ADMIN_ROLES: readonly PlatformAdminRole[] = [
  "super_admin",
  "platform_admin",
] as const;

export function isPlatformAdminRole(v: unknown): v is PlatformAdminRole {
  return (
    typeof v === "string" &&
    (PLATFORM_ADMIN_ROLES as readonly string[]).includes(v)
  );
}

export interface PlatformAdminContext {
  /** Session user id. */
  userId: string;
  /** platform_admins.id */
  platformAdminId: string;
  role: PlatformAdminRole;
  /** Privileged client — only returned AFTER platform auth succeeds. */
  admin: SupabaseClient;
}

export interface RequirePlatformAdminOptions {
  /** Minimum / allowed roles. Defaults to any active platform admin. */
  allowedRoles?: PlatformAdminRole[];
}

/**
 * Resolve a global Platform Admin context.
 *
 * - Session from cookies.
 * - Membership / active account are intentionally ignored.
 * - Suspended / revoked / missing rows → Forbidden (generic).
 */
export async function requirePlatformAdminContext(
  options: RequirePlatformAdminOptions = {},
): Promise<PlatformAdminContext> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new UnauthorizedError();
  }

  // Use service-role AFTER we know the user is authenticated. The
  // platform_admins RLS only lets a user read their own active row;
  // service-role lets us also stamp last_login_at without a client policy.
  const admin = supabaseAdmin();
  const { data: row, error: rowErr } = await admin
    .from("platform_admins")
    .select("id, role, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (rowErr) {
    console.error("[requirePlatformAdminContext] lookup error:", rowErr);
    throw new ForbiddenError("Forbidden");
  }
  if (!row || row.status !== "active" || !isPlatformAdminRole(row.role)) {
    throw new ForbiddenError("Forbidden");
  }

  const allowed = options.allowedRoles;
  if (allowed && allowed.length > 0 && !allowed.includes(row.role)) {
    throw new ForbiddenError("Forbidden");
  }

  // Best-effort last_login stamp — never blocks the request.
  void admin
    .from("platform_admins")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", row.id);

  return {
    userId: user.id,
    platformAdminId: row.id,
    role: row.role,
    admin,
  };
}

export function toPlatformErrorResponse(err: unknown): NextResponse {
  if (err instanceof UnauthorizedError || err instanceof ForbiddenError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error("[toPlatformErrorResponse] uncategorized:", err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

/** True iff the role can manage other platform admins. */
export function canManagePlatformAdmins(role: PlatformAdminRole): boolean {
  return role === "super_admin";
}
