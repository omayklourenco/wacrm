// ============================================================
// Super Admin — organization queries & mutations (Ciclo 003-R).
// All callers must already hold a PlatformAdminContext.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";

export interface OrgListParams {
  q?: string;
  status?: "active" | "suspended" | "all";
  hasOwner?: boolean;
  hasWhatsApp?: boolean;
  page?: number;
  pageSize?: number;
}

export interface OrgListItem {
  id: string;
  name: string;
  platformStatus: string;
  createdAt: string;
  ownerUserId: string | null;
  ownerEmail: string | null;
  memberCount: number;
  whatsappCount: number;
  planCode: string | null;
}

function maskId(id: string): string {
  if (id.length < 8) return id;
  return `${id.slice(0, 8)}…`;
}

export function maskPhoneNumberId(v: string | null | undefined): string | null {
  if (!v) return null;
  if (v.length <= 6) return "***";
  return `${v.slice(0, 3)}…${v.slice(-3)}`;
}

export async function listOrganizations(
  admin: SupabaseClient,
  params: OrgListParams = {},
): Promise<{ items: OrgListItem[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = admin
    .from("accounts")
    .select(
      "id, name, platform_status, created_at, owner_user_id, plan_code",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (params.q?.trim()) {
    query = query.ilike("name", `%${params.q.trim()}%`);
  }
  if (params.status === "active" || params.status === "suspended") {
    query = query.eq("platform_status", params.status);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  const rows = data ?? [];
  const accountIds = rows.map((r) => r.id as string);

  // Batch member + whatsapp counts
  const memberCounts = new Map<string, number>();
  const waCounts = new Map<string, number>();
  const ownerEmails = new Map<string, string>();

  if (accountIds.length > 0) {
    const [{ data: members }, { data: wa }, { data: owners }] = await Promise.all([
      admin
        .from("account_members")
        .select("account_id")
        .in("account_id", accountIds)
        .eq("status", "active"),
      admin
        .from("whatsapp_config")
        .select("account_id")
        .in("account_id", accountIds),
      admin
        .from("profiles")
        .select("user_id, email")
        .in(
          "user_id",
          rows.map((r) => r.owner_user_id).filter(Boolean) as string[],
        ),
    ]);

    for (const m of members ?? []) {
      const id = m.account_id as string;
      memberCounts.set(id, (memberCounts.get(id) ?? 0) + 1);
    }
    for (const w of wa ?? []) {
      const id = w.account_id as string;
      waCounts.set(id, (waCounts.get(id) ?? 0) + 1);
    }
    for (const o of owners ?? []) {
      ownerEmails.set(o.user_id as string, o.email as string);
    }
  }

  let items: OrgListItem[] = rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    platformStatus: r.platform_status as string,
    createdAt: r.created_at as string,
    ownerUserId: (r.owner_user_id as string) ?? null,
    ownerEmail: r.owner_user_id
      ? (ownerEmails.get(r.owner_user_id as string) ?? null)
      : null,
    memberCount: memberCounts.get(r.id as string) ?? 0,
    whatsappCount: waCounts.get(r.id as string) ?? 0,
    planCode: (r.plan_code as string) ?? null,
  }));

  if (params.hasOwner === true) {
    items = items.filter((i) => i.ownerUserId);
  } else if (params.hasOwner === false) {
    items = items.filter((i) => !i.ownerUserId);
  }
  if (params.hasWhatsApp === true) {
    items = items.filter((i) => i.whatsappCount > 0);
  } else if (params.hasWhatsApp === false) {
    items = items.filter((i) => i.whatsappCount === 0);
  }

  return {
    items,
    total: count ?? items.length,
    page,
    pageSize,
  };
}

export async function getOrganizationDetail(
  admin: SupabaseClient,
  accountId: string,
) {
  const { data: account, error } = await admin
    .from("accounts")
    .select(
      "id, name, platform_status, created_at, updated_at, owner_user_id, suspended_at, suspension_reason, plan_code, plan_status",
    )
    .eq("id", accountId)
    .maybeSingle();

  if (error) throw error;
  if (!account) return null;

  const [
    { count: memberCount },
    { count: contactCount },
    { count: conversationCount },
    { data: members },
    { data: waConfigs },
    { count: pendingInvites },
    { data: owners },
  ] = await Promise.all([
    admin
      .from("account_members")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .eq("status", "active"),
    admin
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId),
    admin
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId),
    admin
      .from("account_members")
      .select("user_id, role, status, joined_at, created_at")
      .eq("account_id", accountId)
      .order("created_at", { ascending: true }),
    admin
      .from("whatsapp_config")
      .select("id, phone_number_id, waba_id, status, connected_at")
      .eq("account_id", accountId),
    admin
      .from("account_invitations")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .is("accepted_at", null),
    admin
      .from("account_members")
      .select("user_id")
      .eq("account_id", accountId)
      .eq("role", "owner")
      .eq("status", "active"),
  ]);

  const userIds = (members ?? []).map((m) => m.user_id as string);
  const { data: profiles } =
    userIds.length > 0
      ? await admin
          .from("profiles")
          .select("user_id, full_name, email")
          .in("user_id", userIds)
      : { data: [] };

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.user_id as string, p]),
  );

  const hasActiveOwner = (owners ?? []).length > 0;
  const suspendedMembers = (members ?? []).filter(
    (m) => m.status === "suspended",
  ).length;

  return {
    organization: {
      id: account.id,
      idShort: maskId(account.id as string),
      name: account.name,
      platformStatus: account.platform_status,
      createdAt: account.created_at,
      updatedAt: account.updated_at,
      ownerUserId: account.owner_user_id,
      suspendedAt: account.suspended_at,
      suspensionReason: account.suspension_reason,
      planCode: account.plan_code ?? null,
      planStatus: account.plan_status ?? null,
      memberCount: memberCount ?? 0,
      contactCount: contactCount ?? 0,
      conversationCount: conversationCount ?? 0,
      whatsappCount: (waConfigs ?? []).length,
    },
    members: (members ?? []).map((m) => {
      const p = profileMap.get(m.user_id as string);
      return {
        userId: m.user_id,
        fullName: p?.full_name ?? "",
        email: p?.email ?? null,
        role: m.role,
        status: m.status,
        joinedAt: m.joined_at ?? m.created_at,
      };
    }),
    whatsappChannels: (waConfigs ?? []).map((w) => ({
      id: w.id,
      phoneNumberIdMasked: maskPhoneNumberId(w.phone_number_id as string),
      wabaIdMasked: maskPhoneNumberId(w.waba_id as string | null),
      status: w.status,
      connectedAt: w.connected_at,
    })),
    security: {
      hasActiveOwner,
      suspendedMemberships: suspendedMembers,
      pendingInvites: pendingInvites ?? 0,
    },
  };
}

export async function getPlatformDashboardStats(admin: SupabaseClient) {
  const [
    { count: totalOrgs },
    { count: activeOrgs },
    { count: suspendedOrgs },
    { count: totalUsers },
    { count: activeMemberships },
    { count: waConnected },
    { count: conversations },
  ] = await Promise.all([
    admin.from("accounts").select("id", { count: "exact", head: true }),
    admin
      .from("accounts")
      .select("id", { count: "exact", head: true })
      .eq("platform_status", "active"),
    admin
      .from("accounts")
      .select("id", { count: "exact", head: true })
      .eq("platform_status", "suspended"),
    admin.from("profiles").select("id", { count: "exact", head: true }),
    admin
      .from("account_members")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    admin
      .from("whatsapp_config")
      .select("id", { count: "exact", head: true })
      .eq("status", "connected"),
    admin.from("conversations").select("id", { count: "exact", head: true }),
  ]);

  // Accounts without an active owner membership
  const { data: allAccounts } = await admin
    .from("accounts")
    .select("id");
  const ids = (allAccounts ?? []).map((a) => a.id as string);
  let orgsWithoutOwner = 0;
  if (ids.length > 0) {
    const { data: ownerRows } = await admin
      .from("account_members")
      .select("account_id")
      .in("account_id", ids)
      .eq("role", "owner")
      .eq("status", "active");
    const withOwner = new Set((ownerRows ?? []).map((r) => r.account_id));
    orgsWithoutOwner = ids.filter((id) => !withOwner.has(id)).length;
  }

  return {
    totalOrganizations: totalOrgs ?? 0,
    activeOrganizations: activeOrgs ?? 0,
    suspendedOrganizations: suspendedOrgs ?? 0,
    totalUsers: totalUsers ?? 0,
    activeMemberships: activeMemberships ?? 0,
    organizationsWithoutOwner: orgsWithoutOwner,
    whatsappConnected: waConnected ?? 0,
    totalConversations: conversations ?? 0,
  };
}
