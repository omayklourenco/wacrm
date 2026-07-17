"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { PresenceHeartbeat } from "@/components/presence/presence-heartbeat";

// Auth-gated dashboard shell. Extracted from the layout so the layout
// itself can stay a server component and export metadata (noindex) —
// client components can't export Next's metadata object.

function DashboardShellInner({ children }: { children: React.ReactNode }) {
  const {
    user,
    loading,
    profileLoading,
    accountsLoading,
    availableAccounts,
    accountId,
  } = useAuth();
  const router = useRouter();

  // Sidebar drawer state — only used on mobile. On lg+ the sidebar is
  // always visible and this stays at `false` (ignored by the component).
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  // Onboarding gate (Ciclo 002-R): an authenticated user with zero
  // active memberships has no tenant to scope the app to. Send them to
  // create their first organization. Wait for the membership list to
  // settle first so we don't bounce during the initial load window.
  useEffect(() => {
    if (
      !loading &&
      user &&
      !profileLoading &&
      !accountsLoading &&
      availableAccounts.length === 0
    ) {
      router.push("/onboarding");
    }
  }, [
    loading,
    user,
    profileLoading,
    accountsLoading,
    availableAccounts.length,
    router,
  ]);

  // Suspension gate (Ciclo 003-R): if the active org is suspended and the
  // user has no other operable org, send them to the suspended page.
  // If they have another active org, AuthProvider / getCurrentAccount
  // already falls back; here we only catch the all-suspended case or a
  // stale active pointer still pointing at a suspended org.
  useEffect(() => {
    if (loading || !user || profileLoading || accountsLoading) return;
    if (availableAccounts.length === 0) return;
    const active = availableAccounts.find((a) => a.accountId === accountId);
    const hasOperable = availableAccounts.some(
      (a) => a.platformStatus !== "suspended",
    );
    if (active?.platformStatus === "suspended" && !hasOperable) {
      router.push("/organization-suspended");
    }
  }, [
    loading,
    user,
    profileLoading,
    accountsLoading,
    availableAccounts,
    accountId,
    router,
  ]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Reports this tab's online/away presence once we know a user is
          signed in. Headless — renders nothing. */}
      <PresenceHeartbeat />
      <Sidebar open={sidebarOpen} onClose={closeSidebar} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header onOpenSidebar={() => setSidebarOpen(true)} />
        {/* Thinner horizontal padding on mobile so cards have room to breathe. */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DashboardShellInner>{children}</DashboardShellInner>
    </AuthProvider>
  );
}
