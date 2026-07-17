"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Detail {
  organization: {
    id: string;
    idShort: string;
    name: string;
    platformStatus: string;
    createdAt: string;
    updatedAt: string;
    memberCount: number;
    contactCount: number;
    conversationCount: number;
    whatsappCount: number;
    suspensionReason: string | null;
    planCode: string | null;
  };
  members: Array<{
    userId: string;
    fullName: string;
    email: string | null;
    role: string;
    status: string;
    joinedAt: string;
  }>;
  whatsappChannels: Array<{
    id: string;
    phoneNumberIdMasked: string | null;
    wabaIdMasked: string | null;
    status: string;
  }>;
  security: {
    hasActiveOwner: boolean;
    suspendedMemberships: number;
    pendingInvites: number;
  };
}

export default function SuperAdminOrgDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const res = await fetch(`/api/super-admin/organizations/${id}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      setError(res.status === 404 ? "Organização não encontrada" : "Erro ao carregar");
      return;
    }
    setDetail((await res.json()) as Detail);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/super-admin/organizations/${id}`, {
        cache: "no-store",
      });
      if (cancelled) return;
      if (!res.ok) {
        setError(res.status === 404 ? "Organização não encontrada" : "Erro ao carregar");
        return;
      }
      setDetail((await res.json()) as Detail);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const suspend = async () => {
    if (!id || !reason.trim()) return;
    setBusy(true);
    const res = await fetch(`/api/super-admin/organizations/${id}/suspend`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Falha ao suspender");
      return;
    }
    setReason("");
    await load();
  };

  const activate = async () => {
    if (!id) return;
    setBusy(true);
    const res = await fetch(`/api/super-admin/organizations/${id}/activate`, {
      method: "POST",
    });
    setBusy(false);
    if (!res.ok) {
      setError("Falha ao reativar");
      return;
    }
    await load();
  };

  if (error && !detail) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-red-400">{error}</p>
        <Link href="/super-admin/organizations" className="text-sm text-primary underline">
          Voltar
        </Link>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Carregando…
      </div>
    );
  }

  const org = detail.organization;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/super-admin/organizations"
            className="text-xs text-muted-foreground hover:underline"
          >
            ← Organizações
          </Link>
          <h1 className="text-xl font-semibold text-foreground">{org.name}</h1>
          <p className="text-xs text-muted-foreground">{org.idShort}</p>
        </div>
        <span
          className={`rounded px-2 py-1 text-xs ${
            org.platformStatus === "suspended"
              ? "bg-red-500/10 text-red-400"
              : "bg-emerald-500/10 text-emerald-400"
          }`}
        >
          {org.platformStatus}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Membros", org.memberCount],
          ["Contatos", org.contactCount],
          ["Conversas", org.conversationCount],
          ["WhatsApp", org.whatsappCount],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Membros</h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">E-mail</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {detail.members.map((m) => (
                <tr key={m.userId} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">{m.fullName || "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{m.email ?? "—"}</td>
                  <td className="px-3 py-2">{m.role}</td>
                  <td className="px-3 py-2">{m.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Canais WhatsApp</h2>
        {detail.whatsappChannels.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum canal configurado.</p>
        ) : (
          <ul className="space-y-2">
            {detail.whatsappChannels.map((ch) => (
              <li
                key={ch.id}
                className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
              >
                <span className="font-medium">{ch.status}</span>
                <span className="ml-2 text-muted-foreground">
                  phone {ch.phoneNumberIdMasked} · waba {ch.wabaIdMasked ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Segurança</h2>
        <ul className="list-inside list-disc text-sm text-muted-foreground">
          <li>
            Owner ativo:{" "}
            {detail.security.hasActiveOwner ? "sim" : "não"}
          </li>
          <li>Memberships suspensas: {detail.security.suspendedMemberships}</li>
          <li>Convites pendentes: {detail.security.pendingInvites}</li>
          <li>Plano: {org.planCode ?? "Sem plano"}</li>
        </ul>
      </section>

      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Ações</h2>
        {org.platformStatus === "suspended" ? (
          <div className="space-y-2">
            {org.suspensionReason ? (
              <p className="text-sm text-muted-foreground">
                Motivo: {org.suspensionReason}
              </p>
            ) : null}
            <Button onClick={activate} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Reativar organização"}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="reason">Motivo da suspensão (obrigatório)</Label>
            <Input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex.: violação de termos"
              maxLength={500}
            />
            <Button
              variant="destructive"
              onClick={suspend}
              disabled={busy || !reason.trim()}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Suspender organização"}
            </Button>
          </div>
        )}
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
      </section>
    </div>
  );
}
