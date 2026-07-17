"use client";

// ============================================================
// /onboarding — create the first organization (Ciclo 002-R).
//
// Reached when an authenticated user has no active membership (fresh
// account after removal, or a repaired orphan). The happy-path signup
// trigger already creates a personal org, so most users never see this
// — but it's the safety net for the "user without organization" state.
//
// Idempotent: POST /api/onboarding returns the existing org if the
// user already has one (double-submit / refresh safe), and the button
// is disabled while the request is in flight.
// ============================================================

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Building2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export default function OnboardingPage() {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  // Bounce to login if not authenticated; the onboarding RPC requires
  // a session and this page is outside the middleware-protected paths.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await createClient().auth.getUser();
      if (cancelled) return;
      if (!user) {
        window.location.href = "/login";
        return;
      }
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (submitting) return;
      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch("/api/onboarding", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: name.trim() }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setError(body.error || "Could not create your organization");
          setSubmitting(false);
          return;
        }
        // Full reload so AuthProvider re-fetches memberships under the
        // new active organization.
        window.location.href = "/dashboard";
      } catch {
        setError("Could not reach the server");
        setSubmitting(false);
      }
    },
    [name, submitting],
  );

  if (checking) {
    return (
      <Card className="w-full max-w-md border-border bg-card">
        <CardContent className="flex flex-col items-center gap-3 py-12">
          <Loader2 className="size-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md border-border bg-card">
      <CardHeader className="items-center text-center">
        <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          <Building2 className="h-6 w-6 text-primary" />
        </div>
        <CardTitle className="text-xl text-foreground">
          Create your organization
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          Give your workspace a name to get started. You can invite
          teammates and change this later.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="org-name">Organization name</Label>
            <Input
              id="org-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Inc."
              autoFocus
              maxLength={120}
            />
          </div>
          {error ? (
            <p className="text-sm text-red-400">{error}</p>
          ) : null}
          <Button
            type="submit"
            disabled={submitting}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Creating…
              </>
            ) : (
              "Create organization"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
