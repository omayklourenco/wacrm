import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SuperAdminShell } from "./super-admin-shell";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Super Admin — Oslou Flow",
};

export default function SuperAdminLayout({ children }: { children: ReactNode }) {
  return <SuperAdminShell>{children}</SuperAdminShell>;
}
