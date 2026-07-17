// ============================================================
// GET /api/account/members
//
// Lists every member of the caller's ACTIVE account. Any member can
// call it (agents/viewers see a read-only roster too).
//
// N:N (Ciclo 002-R): membership lives in `account_members`, and a
// co-member's profile row is scoped to THEIR home account under the
// active-scoped RLS, so we read the roster through the SECURITY
// DEFINER `get_account_members()` RPC (which self-checks that the
// caller is an active member of the account being listed).
//
// Field visibility
//   Email is returned only to admins+. Agents and viewers see
//   name + avatar + role + joined date only.
// ============================================================

import { NextResponse } from "next/server";

import { getCurrentAccount, toErrorResponse } from "@/lib/auth/account";
import { canManageMembers, isAccountRole } from "@/lib/auth/roles";
import type { AccountMember } from "@/types";

interface MemberRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  role: string;
  joined_at: string;
}

export async function GET() {
  try {
    const ctx = await getCurrentAccount();

    const { data, error } = await ctx.supabase.rpc("get_account_members");

    if (error) {
      console.error("[GET /api/account/members] fetch error:", error);
      return NextResponse.json(
        { error: "Failed to load members" },
        { status: 500 },
      );
    }

    const canSeeEmails = canManageMembers(ctx.role);

    const members: AccountMember[] = ((data ?? []) as MemberRow[]).flatMap(
      (row) => {
        if (!isAccountRole(row.role)) return [];
        return [
          {
            user_id: row.user_id,
            full_name: row.full_name ?? "",
            email: canSeeEmails ? row.email : null,
            avatar_url: row.avatar_url,
            role: row.role,
            joined_at: row.joined_at,
          },
        ];
      },
    );

    return NextResponse.json({ members });
  } catch (err) {
    return toErrorResponse(err);
  }
}
