import { afterEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn();
const supabaseAdmin = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => createClient(),
}));
vi.mock("@/lib/flows/admin-client", () => ({
  supabaseAdmin: () => supabaseAdmin(),
}));

const { requirePlatformAdminContext, canManagePlatformAdmins } = await import(
  "./platform-admin"
);
const { UnauthorizedError, ForbiddenError } = await import("./account");

afterEach(() => {
  vi.clearAllMocks();
});

function session(user: { id: string } | null) {
  createClient.mockReturnValue({
    auth: {
      getUser: () =>
        Promise.resolve({ data: { user }, error: null }),
    },
  });
}

function adminLookup(row: unknown, error: unknown = null) {
  const maybeSingle = () => Promise.resolve({ data: row, error });
  const eq = () => ({ maybeSingle, update: () => ({ eq: () => Promise.resolve({ error: null }) }) });
  const select = () => ({ eq });
  const from = () => ({ select, update: () => ({ eq: () => Promise.resolve({ error: null }) }) });
  supabaseAdmin.mockReturnValue({ from });
}

describe("requirePlatformAdminContext", () => {
  it("rejects unauthenticated callers", async () => {
    session(null);
    await expect(requirePlatformAdminContext()).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it("rejects tenant users without a platform_admins row", async () => {
    session({ id: "tenant-owner" });
    adminLookup(null);
    await expect(requirePlatformAdminContext()).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("rejects suspended platform admins", async () => {
    session({ id: "admin-1" });
    adminLookup({ id: "pa-1", role: "platform_admin", status: "suspended" });
    await expect(requirePlatformAdminContext()).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("accepts an active platform_admin", async () => {
    session({ id: "admin-1" });
    adminLookup({ id: "pa-1", role: "platform_admin", status: "active" });
    const ctx = await requirePlatformAdminContext();
    expect(ctx).toMatchObject({
      userId: "admin-1",
      platformAdminId: "pa-1",
      role: "platform_admin",
    });
  });

  it("enforces allowedRoles", async () => {
    session({ id: "admin-1" });
    adminLookup({ id: "pa-1", role: "platform_admin", status: "active" });
    await expect(
      requirePlatformAdminContext({ allowedRoles: ["super_admin"] }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("canManagePlatformAdmins", () => {
  it("only super_admin may manage other admins", () => {
    expect(canManagePlatformAdmins("super_admin")).toBe(true);
    expect(canManagePlatformAdmins("platform_admin")).toBe(false);
  });
});
