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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const reason =
      body && typeof body === "object" && "reason" in body
        ? String((body as { reason: unknown }).reason ?? "").trim()
        : "";
    if (!reason) {
      return NextResponse.json(
        { error: "Suspension reason is required" },
        { status: 400 },
      );
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

    // Idempotent: already suspended → no duplicate audit storm, return ok.
    if (account.platform_status === "suspended") {
      return NextResponse.json({
        ok: true,
        alreadySuspended: true,
        accountId: id,
      });
    }

    const { error: updErr } = await ctx.admin
      .from("accounts")
      .update({
        platform_status: "suspended",
        suspended_at: new Date().toISOString(),
        suspended_by: ctx.userId,
        suspension_reason: reason.slice(0, 500),
      })
      .eq("id", id);
    if (updErr) throw updErr;

    const meta = clientMeta(request);
    await writePlatformAuditLog({
      admin: ctx.admin,
      platformAdminId: ctx.platformAdminId,
      actorUserId: ctx.userId,
      action: "organization.suspended",
      targetType: "account",
      targetId: id,
      metadata: { reason: reason.slice(0, 500) },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return NextResponse.json({ ok: true, accountId: id });
  } catch (err) {
    return toPlatformErrorResponse(err);
  }
}
