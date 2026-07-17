"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export default function SuperAdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await createClient().auth.getUser();
      if (cancelled) return;
      if (user) {
        const res = await fetch("/api/super-admin/me", { cache: "no-store" });
        if (res.ok) {
          window.location.href = "/super-admin";
          return;
        }
      }
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: authErr } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (authErr) {
      setError("Credenciais inválidas");
      setLoading(false);
      return;
    }
    const res = await fetch("/api/super-admin/me", { cache: "no-store" });
    if (!res.ok) {
      await supabase.auth.signOut();
      setError("Esta conta não é um administrador da plataforma.");
      setLoading(false);
      return;
    }
    window.location.href = "/super-admin";
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-6"
      >
        <div>
          <h1 className="text-lg font-semibold text-foreground">
            Super Admin — Oslou Flow
          </h1>
          <p className="text-sm text-muted-foreground">
            Acesso restrito a administradores da plataforma.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Senha</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? <Loader2 className="size-4 animate-spin" /> : "Entrar"}
        </Button>
        <Link
          href="/login"
          className="block text-center text-xs text-muted-foreground underline"
        >
          Login do tenant
        </Link>
      </form>
    </div>
  );
}
