import { NextResponse } from "next/server";

import {
  requirePlatformAdminContext,
  toPlatformErrorResponse,
} from "@/lib/auth/platform-admin";
import { getOrganizationDetail } from "@/lib/platform/organizations";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requirePlatformAdminContext();
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }
    const detail = await getOrganizationDetail(ctx.admin, id);
    if (!detail) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (err) {
    return toPlatformErrorResponse(err);
  }
}
