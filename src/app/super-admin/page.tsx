"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

interface Stats {
  totalOrganizations: number;
  activeOrganizations: number;
  suspendedOrganizations: number;
  totalUsers: number;
  activeMemberships: number;
  organizationsWithoutOwner: number;
  whatsappConnected: number;
  totalConversations: number;
}

export default function SuperAdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/super-admin/dashboard", { cache: "no-store" });
      if (cancelled) return;
      if (!res.ok) {
        setError("Falha ao carregar métricas");
        return;
      }
      const body = (await res.json()) as { stats: Stats };
      setStats(body.stats);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <p className="text-sm text-red-400">{error}</p>;
  }
  if (!stats) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Carregando…
      </div>
    );
  }

  const cards: { label: string; value: number }[] = [
    { label: "Organizações", value: stats.totalOrganizations },
    { label: "Ativas", value: stats.activeOrganizations },
    { label: "Suspensas", value: stats.suspendedOrganizations },
    { label: "Usuários", value: stats.totalUsers },
    { label: "Memberships ativas", value: stats.activeMemberships },
    { label: "Sem owner", value: stats.organizationsWithoutOwner },
    { label: "WhatsApp conectados", value: stats.whatsappConnected },
    { label: "Conversas", value: stats.totalConversations },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Visão geral</h1>
        <p className="text-sm text-muted-foreground">
          Métricas agregadas da plataforma Oslou Flow.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-lg border border-border bg-card p-4"
          >
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">
              {c.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
