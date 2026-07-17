import { NextResponse } from "next/server";

import {
  requirePlatformAdminContext,
  toPlatformErrorResponse,
} from "@/lib/auth/platform-admin";
import { listOrganizations } from "@/lib/platform/organizations";

export async function GET(request: Request) {
  try {
    const ctx = await requirePlatformAdminContext();
    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? undefined;
    const statusParam = url.searchParams.get("status") ?? "all";
    const status =
      statusParam === "active" || statusParam === "suspended"
        ? statusParam
        : "all";
    const page = Number(url.searchParams.get("page") ?? "1");
    const pageSize = Number(url.searchParams.get("pageSize") ?? "20");
    const hasOwnerParam = url.searchParams.get("hasOwner");
    const hasWhatsAppParam = url.searchParams.get("hasWhatsApp");

    const result = await listOrganizations(ctx.admin, {
      q,
      status,
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 20,
      hasOwner:
        hasOwnerParam === "true"
          ? true
          : hasOwnerParam === "false"
            ? false
            : undefined,
      hasWhatsApp:
        hasWhatsAppParam === "true"
          ? true
          : hasWhatsAppParam === "false"
            ? false
            : undefined,
    });

    return NextResponse.json(result);
  } catch (err) {
    return toPlatformErrorResponse(err);
  }
}
