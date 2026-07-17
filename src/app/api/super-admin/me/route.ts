import { NextResponse } from "next/server";

import {
  requirePlatformAdminContext,
  toPlatformErrorResponse,
} from "@/lib/auth/platform-admin";

export async function GET() {
  try {
    const ctx = await requirePlatformAdminContext();
    return NextResponse.json({
      userId: ctx.userId,
      platformAdminId: ctx.platformAdminId,
      role: ctx.role,
    });
  } catch (err) {
    return toPlatformErrorResponse(err);
  }
}
