import { NextResponse } from "next/server";

import {
  requirePlatformAdminContext,
  toPlatformErrorResponse,
} from "@/lib/auth/platform-admin";
import { writePlatformAuditLog } from "@/lib/auth/platform-audit";

function clientMeta(request: Request) {
  const xff = request.headers.get("x-forwarded-for");
  const ip = xff ? xff.split(",")[0].trim() : request.headers.get("x-real-ip");
  return {
    ipAddress: ip,
    userAgent: request.headers.get("user-agent"),
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requirePlatformAdminContext();
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const { data: account, error: fetchErr } = await ctx.admin
      .from("accounts")
      .select("id, platform_status")
      .eq("id", id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!account) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (account.platform_status === "active") {
      return NextResponse.json({
        ok: true,
        alreadyActive: true,
        accountId: id,
      });
    }

    const { error: updErr } = await ctx.admin
      .from("accounts")
      .update({
        platform_status: "active",
        suspended_at: null,
        suspended_by: null,
        suspension_reason: null,
      })
      .eq("id", id);
    if (updErr) throw updErr;

    const meta = clientMeta(request);
    await writePlatformAuditLog({
      admin: ctx.admin,
      platformAdminId: ctx.platformAdminId,
      actorUserId: ctx.userId,
      action: "organization.activated",
      targetType: "account",
      targetId: id,
      metadata: {},
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return NextResponse.json({ ok: true, accountId: id });
  } catch (err) {
    return toPlatformErrorResponse(err);
  }
}
