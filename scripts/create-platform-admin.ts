/**
 * Local-only helper to grant platform admin to an existing Auth user.
 *
 * Usage:
 *   PLATFORM_ADMIN_USER_ID=<uuid> npx tsx scripts/create-platform-admin.ts
 *   # or resolve by email:
 *   PLATFORM_ADMIN_EMAIL=admin@example.com npx tsx scripts/create-platform-admin.ts
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL in env.
 * Does NOT create Auth users and does NOT hardcode credentials.
 * Never run against production without explicit ops approval.
 */

import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = process.env.PLATFORM_ADMIN_EMAIL?.trim();
  let userId = process.env.PLATFORM_ADMIN_USER_ID?.trim();
  const role = (process.env.PLATFORM_ADMIN_ROLE?.trim() || "super_admin") as
    | "super_admin"
    | "platform_admin";

  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  if (!userId && !email) {
    console.error("Set PLATFORM_ADMIN_USER_ID or PLATFORM_ADMIN_EMAIL");
    process.exit(1);
  }

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (!userId && email) {
    // Paginate users — local/dev only; fine for small installs.
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (error) {
      console.error(error.message);
      process.exit(1);
    }
    const match = data.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase(),
    );
    if (!match) {
      console.error(`No auth user with email ${email}`);
      process.exit(1);
    }
    userId = match.id;
  }

  const { data, error } = await admin.rpc("grant_platform_admin", {
    p_user_id: userId,
    p_role: role,
  });
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  console.log(`Granted ${role} to ${userId} (platform_admin id=${data})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
