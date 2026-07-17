// ============================================================
// Server-side account context — for API routes and server
// components. Resolves the caller's ACTIVE account + role from the
// N:N `account_members` table (Ciclo 002-R) in one round trip.
//
// IMPORTANT: this module is server-only. It imports the Supabase
// SSR client (`@/lib/supabase/server`), which reads `next/headers`
// cookies. Importing it from a client component will fail at
// build time with the standard Next.js "You're importing a
// component that needs `next/headers`" error — that's the
// boundary check; we don't need the `server-only` package.
//
// Calling convention
// ------------------
//   try {
//     const ctx = await requireRole("admin");
//     // ctx.supabase   — the SSR client (RLS scoped to the active account)
//     // ctx.userId     — auth.uid()
//     // ctx.accountId  — the caller's ACTIVE account
//     // ctx.role       — role within the active account
//     // ctx.availableAccounts — every org the caller belongs to
//   } catch (err) {
//     return toErrorResponse(err);
//   }
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { hasMinRole, isAccountRole, type AccountRole } from "./roles";

// ------------------------------------------------------------
// Errors
// ------------------------------------------------------------

export class UnauthorizedError extends Error {
  readonly status = 401 as const;
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  readonly status = 403 as const;
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * A distinct error for "authenticated, but has no active organization".
 * Routes / pages can catch this to redirect to onboarding instead of
 * showing a generic 403.
 */
export class NoActiveAccountError extends Error {
  readonly status = 409 as const;
  constructor(message = "No active organization") {
    super(message);
    this.name = "NoActiveAccountError";
  }
}

/**
 * Convert one of the typed errors above (or anything else) into a
 * `NextResponse`. Unknown errors collapse to 500 with a generic
 * message — we never leak internals to the wire.
 */
export function toErrorResponse(err: unknown): NextResponse {
  if (
    err instanceof UnauthorizedError ||
    err instanceof ForbiddenError ||
    err instanceof NoActiveAccountError
  ) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error("[toErrorResponse] uncategorized error:", err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

// ------------------------------------------------------------
// Account context
// ------------------------------------------------------------

/** One organization the caller belongs to (for switcher / context). */
export interface AvailableAccount {
  accountId: string;
  name: string;
  role: AccountRole;
}

export interface AccountContext {
  /** Supabase SSR client, RLS scoped to the active account. */
  supabase: SupabaseClient;
  /** `auth.uid()` for the caller. Always defined when this resolves. */
  userId: string;
  /** Caller's ACTIVE account id (from account_members / active_account_id). */
  accountId: string;
  /** Caller's role within the active account. */
  role: AccountRole;
  /**
   * Stable membership identifier for the active account. With the N:N
   * model (Ciclo 002-R) a membership is a row in `account_members`,
   * uniquely keyed by (account_id, user_id); we surface that composite
   * as `${accountId}:${userId}` so callers have a stable handle without
   * an extra round trip for the row's own uuid.
   */
  membershipId: string;
  /** Lightweight active-account meta — id + name. */
  account: { id: string; name: string };
  /** Every organization the caller is an active member of. */
  availableAccounts: AvailableAccount[];
}

interface UserAccountRow {
  account_id: string;
  name: string;
  role: string;
  status: string;
  is_active: boolean;
}

/**
 * Resolve the caller's user + ACTIVE account + role in one round trip.
 *
 * Uses the `get_user_accounts()` RPC (SECURITY DEFINER) which returns
 * every active membership regardless of the active-scoped `accounts`
 * RLS, so it works even for freshly-switched or fallback contexts.
 *
 * Throws `UnauthorizedError` if there's no Supabase session.
 * Throws `NoActiveAccountError` if the caller has zero memberships
 * (the app should route them to onboarding).
 */
export async function getCurrentAccount(): Promise<AccountContext> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    throw new UnauthorizedError();
  }

  const { data, error } = await supabase.rpc("get_user_accounts");
  if (error) {
    console.error("[getCurrentAccount] get_user_accounts error:", error);
    throw new ForbiddenError("Could not load account context");
  }

  const accounts = (data ?? []) as UserAccountRow[];
  if (accounts.length === 0) {
    throw new NoActiveAccountError();
  }

  // Pick the stored active membership; fall back to the first one and
  // repair the pointer so RLS (which keys off profiles.active_account_id)
  // scopes to a valid account instead of returning empty everywhere.
  let active = accounts.find((a) => a.is_active);
  if (!active) {
    active = accounts[0];
    const { error: switchErr } = await supabase.rpc("set_active_account", {
      p_account_id: active.account_id,
    });
    if (switchErr) {
      console.error("[getCurrentAccount] fallback set_active_account error:", switchErr);
    }
  }

  if (!isAccountRole(active.role)) {
    throw new ForbiddenError(`Unknown account role: ${active.role}`);
  }

  const availableAccounts: AvailableAccount[] = accounts.flatMap((a) =>
    isAccountRole(a.role)
      ? [{ accountId: a.account_id, name: a.name, role: a.role }]
      : [],
  );

  return {
    supabase,
    userId: user.id,
    accountId: active.account_id,
    role: active.role,
    membershipId: `${active.account_id}:${user.id}`,
    account: { id: active.account_id, name: active.name },
    availableAccounts,
  };
}

export interface RequireAccountContextOptions {
  /**
   * Optional account id from body/query/path. NEVER trusted alone —
   * must equal the caller's ACTIVE account or the request is denied
   * with a generic Forbidden (no existence leak). To operate on a
   * different organization the caller must switch it active first
   * (POST /api/account/active), which validates membership.
   */
  requestedAccountId?: string | null;
  /** Minimum role required. Defaults to viewer (any member). */
  allowedRoles?: AccountRole;
}

/**
 * Central account-context gate for privileged routes.
 *
 * - User comes from the authenticated session.
 * - Account comes from the active membership, never the client alone.
 * - requestedAccountId is validated against the active account.
 */
export async function requireAccountContext(
  options: RequireAccountContextOptions = {},
): Promise<AccountContext> {
  const ctx = options.allowedRoles
    ? await requireRole(options.allowedRoles)
    : await getCurrentAccount();

  const requested = options.requestedAccountId?.trim();
  if (requested && requested !== ctx.accountId) {
    // The caller may well be a member of `requested`, but it is not the
    // active tenant for this request — RLS is scoped to the active
    // account, so honoring it here would silently return empty / wrong
    // data. Force an explicit switch instead of guessing.
    throw new ForbiddenError("Forbidden");
  }
  return ctx;
}

/**
 * Resolve the caller's account context and enforce a minimum role
 * within the ACTIVE account.
 */
export async function requireRole(min: AccountRole): Promise<AccountContext> {
  const ctx = await getCurrentAccount();
  if (!hasMinRole(ctx.role, min)) {
    throw new ForbiddenError(
      `This action requires the '${min}' role or higher`,
    );
  }
  return ctx;
}
