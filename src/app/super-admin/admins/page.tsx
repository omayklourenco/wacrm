"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AdminRow {
  id: string;
  userId: string;
  role: string;
  status: string;
  email: string | null;
  fullName: string | null;
  createdAt: string;
}

export default function SuperAdminAdminsPage() {
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("platform_admin");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/super-admin/admins", { cache: "no-store" });
    if (!res.ok) {
      setError("Falha ao carregar administradores");
      return;
    }
    const body = (await res.json()) as {
      admins: AdminRow[];
      canManage: boolean;
    };
    setAdmins(body.admins);
    setCanManage(body.canManage);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/super-admin/admins", { cache: "no-store" });
      if (cancelled) return;
      if (!res.ok) {
        setError("Falha ao carregar administradores");
        return;
      }
      const body = (await res.json()) as {
        admins: AdminRow[];
        canManage: boolean;
      };
      setAdmins(body.admins);
      setCanManage(body.canManage);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const create = async () => {
    if (!userId.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/super-admin/admins", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: userId.trim(), role }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Falha ao conceder");
      return;
    }
    setUserId("");
    await load();
  };

  const suspend = async (uid: string) => {
    setBusy(true);
    const res = await fetch(`/api/super-admin/admins/${uid}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "suspend" }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Falha ao suspender");
      return;
    }
    await load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Administradores da plataforma</h1>
        <p className="text-sm text-muted-foreground">
          Identidade global — independente de memberships tenant.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/40">
            <tr>
              <th className="px-3 py-2">Nome</th>
              <th className="px-3 py-2">E-mail</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2">{a.fullName ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{a.email ?? "—"}</td>
                <td className="px-3 py-2">{a.role}</td>
                <td className="px-3 py-2">{a.status}</td>
                <td className="px-3 py-2 text-right">
                  {canManage && a.status === "active" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => suspend(a.userId)}
                    >
                      Suspender
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canManage ? (
        <div className="space-y-3 rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Conceder acesso</h2>
          <p className="text-xs text-muted-foreground">
            Informe o user_id Auth existente (UUID). Não cria usuário Auth.
          </p>
          <div className="space-y-2">
            <Label htmlFor="uid">User ID</Label>
            <Input
              id="uid"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="uuid…"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <select
              id="role"
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="platform_admin">platform_admin</option>
              <option value="super_admin">super_admin</option>
            </select>
          </div>
          <Button onClick={create} disabled={busy || !userId.trim()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Conceder"}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Apenas super_admin pode gerenciar outros administradores.
        </p>
      )}

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
    </div>
  );
}
