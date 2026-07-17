import { NextResponse } from "next/server";

import {
  requirePlatformAdminContext,
  toPlatformErrorResponse,
} from "@/lib/auth/platform-admin";
import { writePlatformAuditLog } from "@/lib/auth/platform-audit";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const ctx = await requirePlatformAdminContext({
      allowedRoles: ["super_admin"],
    });
    const { userId } = await params;
    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const action =
      body && typeof body === "object" && "action" in body
        ? String((body as { action: unknown }).action ?? "suspend")
        : "suspend";

    if (action === "revoke") {
      const { error } = await ctx.admin.rpc("revoke_platform_admin", {
        p_user_id: userId,
      });
      if (error) {
        if (error.code === "22023" || error.code === "42501") {
          return NextResponse.json(
            { error: error.message },
            { status: error.code === "42501" ? 403 : 400 },
          );
        }
        throw error;
      }
      await writePlatformAuditLog({
        admin: ctx.admin,
        platformAdminId: ctx.platformAdminId,
        actorUserId: ctx.userId,
        action: "platform_admin.revoked",
        targetType: "user",
        targetId: userId,
        metadata: {},
      });
      return NextResponse.json({ ok: true });
    }

    // suspend (soft — keep row, status=suspended)
    const { data: target } = await ctx.admin
      .from("platform_admins")
      .select("id, role, status")
      .eq("user_id", userId)
      .maybeSingle();
    if (!target) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (target.role === "super_admin") {
      const { count } = await ctx.admin
        .from("platform_admins")
        .select("id", { count: "exact", head: true })
        .eq("role", "super_admin")
        .eq("status", "active");
      if ((count ?? 0) <= 1) {
        return NextResponse.json(
          { error: "Cannot suspend the last active super_admin" },
          { status: 400 },
        );
      }
    }
    if (userId === ctx.userId) {
      return NextResponse.json(
        { error: "Cannot suspend yourself" },
        { status: 400 },
      );
    }

    if (target.status === "suspended") {
      return NextResponse.json({ ok: true, alreadySuspended: true });
    }

    const { error: updErr } = await ctx.admin
      .from("platform_admins")
      .update({ status: "suspended" })
      .eq("user_id", userId);
    if (updErr) throw updErr;

    await writePlatformAuditLog({
      admin: ctx.admin,
      platformAdminId: ctx.platformAdminId,
      actorUserId: ctx.userId,
      action: "platform_admin.suspended",
      targetType: "platform_admin",
      targetId: target.id as string,
      metadata: { userId },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toPlatformErrorResponse(err);
  }
}
