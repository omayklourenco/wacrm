import { NextResponse } from "next/server";

import {
  requirePlatformAdminContext,
  toPlatformErrorResponse,
} from "@/lib/auth/platform-admin";
import { getPlatformDashboardStats } from "@/lib/platform/organizations";

export async function GET() {
  try {
    const ctx = await requirePlatformAdminContext();
    const stats = await getPlatformDashboardStats(ctx.admin);
    return NextResponse.json({ stats });
  } catch (err) {
    return toPlatformErrorResponse(err);
  }
}
