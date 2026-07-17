// ============================================================
// POST /api/onboarding — create the caller's first organization
//
// Idempotent onboarding entry point. Delegates to the SECURITY
// DEFINER `create_account_with_owner` RPC, which atomically creates
// the account, the caller's owner membership, and sets it active.
// Safe against double-submit: if the caller already has an active
// organization we return it instead of minting a duplicate.
// ============================================================

import { NextResponse } from "next/server";

import {
  getCurrentAccount,
  NoActiveAccountError,
  toErrorResponse,
  UnauthorizedError,
} from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new UnauthorizedError();

    // Idempotency: already onboarded → return the active org, no new row.
    try {
      const ctx = await getCurrentAccount();
      return NextResponse.json({
        ok: true,
        accountId: ctx.accountId,
        alreadyOnboarded: true,
      });
    } catch (err) {
      if (!(err instanceof NoActiveAccountError)) throw err;
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const name =
      body && typeof body === "object" && "name" in body
        ? String((body as { name: unknown }).name ?? "").trim()
        : "";

    const { data: accountId, error } = await supabase.rpc(
      "create_account_with_owner",
      { p_name: name },
    );
    if (error) {
      console.error("[POST /api/onboarding] create error:", error);
      return NextResponse.json(
        { error: "Failed to create organization" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, accountId });
  } catch (err) {
    return toErrorResponse(err);
  }
}
