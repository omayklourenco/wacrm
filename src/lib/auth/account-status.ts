// ============================================================
// Organization platform-status helpers (Ciclo 003-R).
//
// Separates account-level suspension from membership status.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";

export type AccountPlatformStatus = "active" | "suspended";

export class AccountSuspendedError extends Error {
  readonly status = 403 as const;
  readonly accountId: string;
  constructor(accountId: string, message = "Organization suspended") {
    super(message);
    this.name = "AccountSuspendedError";
    this.accountId = accountId;
  }
}

/**
 * Throws AccountSuspendedError when the account's platform_status is
 * suspended. Uses the provided client (SSR or service-role).
 */
export async function assertAccountNotSuspended(
  client: SupabaseClient,
  accountId: string,
): Promise<void> {
  const { data, error } = await client
    .from("accounts")
    .select("platform_status")
    .eq("id", accountId)
    .maybeSingle();

  if (error) {
    console.error("[assertAccountNotSuspended] lookup error:", error);
    // Fail closed for privileged paths — treat unknown as suspended.
    throw new AccountSuspendedError(accountId);
  }
  if (!data || data.platform_status === "suspended") {
    throw new AccountSuspendedError(accountId);
  }
}

export function isAccountPlatformStatus(
  v: unknown,
): v is AccountPlatformStatus {
  return v === "active" || v === "suspended";
}
