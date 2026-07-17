// ============================================================
// GET  /api/account/active — list the caller's organizations + active
// POST /api/account/active — switch the active organization
//
// The active organization (tenant) is persisted server-side on
// profiles.active_account_id via the SECURITY DEFINER set_active_account
// RPC, which validates membership. This route never trusts the body
// blindly: the RPC refuses any account the caller is not an active
// member of, so a tampered request can't cross tenants.
//
// A non-authoritative `oslou_active_account` cookie is mirrored for
// fast client reads / optimistic UI. RLS and every server read use the
// DB value, never the cookie.
// ============================================================

import { NextResponse } from "next/server";

import {
  getCurrentAccount,
  toErrorResponse,
  UnauthorizedError,
} from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";

const ACTIVE_ACCOUNT_COOKIE = "oslou_active_account";

export async function GET() {
  try {
    const ctx = await getCurrentAccount();
    return NextResponse.json({
      activeAccountId: ctx.accountId,
      accounts: ctx.availableAccounts,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new UnauthorizedError();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const accountId =
      body && typeof body === "object" && "accountId" in body
        ? String((body as { accountId: unknown }).accountId ?? "").trim()
        : "";
    if (!accountId) {
      return NextResponse.json(
        { error: "Missing accountId" },
        { status: 400 },
      );
    }

    // The RPC validates active membership; a foreign / suspended /
    // removed account raises 42501 → mapped to 403 below.
    const { error } = await supabase.rpc("set_active_account", {
      p_account_id: accountId,
    });
    if (error) {
      if (error.code === "42501") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      console.error("[POST /api/account/active] set_active_account error:", error);
      return NextResponse.json(
        { error: "Failed to switch organization" },
        { status: 500 },
      );
    }

    const res = NextResponse.json({ ok: true, activeAccountId: accountId });
    res.cookies.set(ACTIVE_ACCOUNT_COOKIE, accountId, {
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return res;
  } catch (err) {
    return toErrorResponse(err);
  }
}
