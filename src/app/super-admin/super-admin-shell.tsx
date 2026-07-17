"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  Building2,
  ClipboardList,
  LayoutDashboard,
  Loader2,
  Shield,
  Users,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";

const NAV = [
  { href: "/super-admin", label: "Visão geral", icon: LayoutDashboard },
  { href: "/super-admin/organizations", label: "Organizações", icon: Building2 },
  { href: "/super-admin/admins", label: "Administradores", icon: Users },
  { href: "/super-admin/audit", label: "Auditoria", icon: ClipboardList },
] as const;

export function SuperAdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<
    "loading" | "forbidden" | "ready"
  >("loading");
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await createClient().auth.getUser();
      if (!user) {
        window.location.href = "/super-admin/login";
        return;
      }
      const res = await fetch("/api/super-admin/me", { cache: "no-store" });
      if (cancelled) return;
      if (!res.ok) {
        setState("forbidden");
        return;
      }
      const body = (await res.json()) as { role?: string };
      setRole(body.role ?? null);
      setState("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Login page renders without the shell chrome.
  if (pathname === "/super-admin/login") {
    return <>{children}</>;
  }

  if (state === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  if (state === "forbidden") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4">
        <Shield className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Você não tem acesso ao painel Super Admin.
        </p>
        <Link href="/dashboard" className="text-sm text-primary underline">
          Voltar ao dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-56 shrink-0 border-r border-border bg-card p-4 md:block">
        <div className="mb-6 flex items-center gap-2">
          <Shield className="size-5 text-primary" />
          <div>
            <p className="text-sm font-semibold text-foreground">Oslou Flow</p>
            <p className="text-xs text-muted-foreground">Super Admin</p>
          </div>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map((item) => {
            const active =
              item.href === "/super-admin"
                ? pathname === "/super-admin"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors ${
                  active
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        {role ? (
          <p className="mt-8 text-xs text-muted-foreground">Role: {role}</p>
        ) : null}
      </aside>
      <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
    </div>
  );
}
