// ============================================================
// /onboarding layout — minimal centered shell (Ciclo 002-R).
//
// Sits outside (auth) and (dashboard): the visitor IS authenticated
// (so (auth) would bounce them away) but has NO active organization
// yet (so (dashboard) would bounce them to a broken state). A
// dedicated layout renders the create-organization card on the same
// centered background as login / join.
// ============================================================

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function OnboardingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      {children}
    </div>
  );
}
