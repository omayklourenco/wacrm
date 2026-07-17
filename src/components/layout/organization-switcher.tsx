"use client";

// ============================================================
// Organization switcher (Ciclo 002-R)
//
// Renders the active organization and, when the user belongs to more
// than one, a dropdown to switch between them. Switching posts to
// /api/account/active (which validates membership server-side via the
// set_active_account RPC) and hard-reloads so every RLS-scoped query
// re-runs under the new tenant. Accounts the user is not a member of
// are never listed — the list comes from get_user_accounts.
// ============================================================

import { useState } from "react";
import { Building2, Check, ChevronsUpDown, Loader2 } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  agent: "Agent",
  viewer: "Viewer",
};

export function OrganizationSwitcher() {
  const { availableAccounts, accountId, accountsLoading, switchAccount } =
    useAuth();
  const [switching, setSwitching] = useState<string | null>(null);

  if (accountsLoading && availableAccounts.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  }

  if (availableAccounts.length === 0) return null;

  const active =
    availableAccounts.find((a) => a.accountId === accountId) ??
    availableAccounts.find((a) => a.isActive) ??
    availableAccounts[0];

  // Single organization: show a static label, no dropdown affordance.
  if (availableAccounts.length === 1) {
    return (
      <div className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1 text-sm">
        <Building2 className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate font-medium text-foreground">
          {active?.name}
        </span>
      </div>
    );
  }

  const handleSwitch = async (id: string) => {
    if (id === accountId) return;
    setSwitching(id);
    try {
      await switchAccount(id);
    } finally {
      setSwitching(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex min-w-0 max-w-[200px] items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors hover:bg-muted/70 focus:bg-muted/70 focus:outline-none data-popup-open:bg-muted/70"
        aria-label="Switch organization"
      >
        <Building2 className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate font-medium text-foreground">
          {active?.name}
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="min-w-60 bg-popover text-popover-foreground ring-border"
      >
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Organizations
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-border" />
        {availableAccounts.map((acc) => {
          const isActive = acc.accountId === accountId;
          const isBusy = switching === acc.accountId;
          const isSuspended = acc.platformStatus === "suspended";
          return (
            <DropdownMenuItem
              key={acc.accountId}
              onClick={() => {
                if (isSuspended) return;
                void handleSwitch(acc.accountId);
              }}
              disabled={isBusy || isSuspended}
              className="flex items-center justify-between gap-2 text-popover-foreground focus:bg-accent focus:text-accent-foreground"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{acc.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {ROLE_LABEL[acc.role] ?? acc.role}
                  {isSuspended ? " · suspensa" : ""}
                </span>
              </span>
              {isBusy ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
              ) : isActive ? (
                <Check className="size-4 shrink-0 text-primary" />
              ) : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
