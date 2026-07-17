"use client";

import Link from "next/link";
import { Building2 } from "lucide-react";

import { OrganizationSwitcher } from "@/components/layout/organization-switcher";
import { AuthProvider } from "@/hooks/use-auth";

function SuspendedInner() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10">
        <Building2 className="h-6 w-6 text-red-400" />
      </div>
      <h1 className="text-center text-xl font-semibold text-foreground">
        Organização suspensa
      </h1>
      <p className="max-w-md text-center text-sm text-muted-foreground">
        Esta organização está temporariamente suspensa. Entre em contato com o
        suporte da Oslou.
      </p>
      <div className="mt-2 flex flex-col items-center gap-3">
        <p className="text-xs text-muted-foreground">
          Se você participa de outra organização ativa, troque abaixo:
        </p>
        <OrganizationSwitcher />
        <Link href="/dashboard" className="text-sm text-primary underline">
          Ir ao dashboard
        </Link>
      </div>
    </div>
  );
}

export default function OrganizationSuspendedPage() {
  return (
    <AuthProvider>
      <SuspendedInner />
    </AuthProvider>
  );
}
