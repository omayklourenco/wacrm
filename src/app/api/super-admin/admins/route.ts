import { NextResponse } from "next/server";

import {
  canManagePlatformAdmins,
  requirePlatformAdminContext,
  toPlatformErrorResponse,
  isPlatformAdminRole,
} from "@/lib/auth/platform-admin";
import { writePlatformAuditLog } from "@/lib/auth/platform-audit";

export async function GET() {
  try {
    const ctx = await requirePlatformAdminContext();
    const { data, error } = await ctx.admin
      .from("platform_admins")
      .select("id, user_id, role, status, created_at, last_login_at")
      .order("created_at", { ascending: true });
    if (error) throw error;

    const userIds = (data ?? []).map((r) => r.user_id as string);
    const { data: profiles } =
      userIds.length > 0
        ? await ctx.admin
            .from("profiles")
            .select("user_id, email, full_name")
            .in("user_id", userIds)
        : { data: [] };
    const map = new Map((profiles ?? []).map((p) => [p.user_id, p]));

    return NextResponse.json({
      admins: (data ?? []).map((r) => ({
        id: r.id,
        userId: r.user_id,
        role: r.role,
        status: r.status,
        createdAt: r.created_at,
        lastLoginAt: r.last_login_at,
        email: map.get(r.user_id as string)?.email ?? null,
        fullName: map.get(r.user_id as string)?.full_name ?? null,
      })),
      canManage: canManagePlatformAdmins(ctx.role),
    });
  } catch (err) {
    return toPlatformErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requirePlatformAdminContext({
      allowedRoles: ["super_admin"],
    });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const userId =
      body && typeof body === "object" && "userId" in body
        ? String((body as { userId: unknown }).userId ?? "").trim()
        : "";
    const roleRaw =
      body && typeof body === "object" && "role" in body
        ? String((body as { role: unknown }).role ?? "platform_admin")
        : "platform_admin";
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }
    if (!isPlatformAdminRole(roleRaw)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const { data: adminId, error } = await ctx.admin.rpc("grant_platform_admin", {
      p_user_id: userId,
      p_role: roleRaw,
    });
    if (error) {
      if (error.code === "42501") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (error.code === "22023") {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }

    await writePlatformAuditLog({
      admin: ctx.admin,
      platformAdminId: ctx.platformAdminId,
      actorUserId: ctx.userId,
      action: "platform_admin.created",
      targetType: "platform_admin",
      targetId: typeof adminId === "string" ? adminId : null,
      metadata: { userId, role: roleRaw },
    });

    return NextResponse.json({ ok: true, platformAdminId: adminId });
  } catch (err) {
    return toPlatformErrorResponse(err);
  }
}
