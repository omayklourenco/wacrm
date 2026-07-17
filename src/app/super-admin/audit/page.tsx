"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

interface AuditItem {
  id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export default function SuperAdminAuditPage() {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/super-admin/audit?pageSize=50", {
        cache: "no-store",
      });
      if (cancelled) return;
      if (res.ok) {
        const body = (await res.json()) as { items: AuditItem[] };
        setItems(body.items);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Auditoria</h1>
        <p className="text-sm text-muted-foreground">
          Log append-only de ações administrativas.
        </p>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Carregando…
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th className="px-3 py-2">Quando</th>
                <th className="px-3 py-2">Ação</th>
                <th className="px-3 py-2">Alvo</th>
                <th className="px-3 py-2">Metadata</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 text-muted-foreground">
                    {new Date(item.created_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 font-medium">{item.action}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {item.target_type}
                    {item.target_id ? ` · ${item.target_id.slice(0, 8)}…` : ""}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {JSON.stringify(item.metadata)}
                  </td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                    Nenhum evento ainda.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
