import { afterEach, describe, expect, it, vi } from "vitest";

// requireAccountContext gates privileged routes: it resolves the
// active account and validates any requestedAccountId against it.

function makeClient(opts: {
  user: { id: string } | null;
  accounts?: { data: unknown; error: unknown };
}) {
  const rpc = (fn: string) => {
    if (fn === "get_user_accounts") {
      return Promise.resolve(opts.accounts ?? { data: [], error: null });
    }
    return Promise.resolve({ data: null, error: null });
  };
  return {
    client: {
      auth: {
        getUser: () =>
          Promise.resolve({ data: { user: opts.user }, error: null }),
      },
      rpc,
    },
  };
}

const createClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => createClient(),
}));

const { requireAccountContext, UnauthorizedError, ForbiddenError } =
  await import("./account");

const ACTIVE_A = {
  data: [
    { account_id: "acct-a", name: "A", role: "admin", status: "active", is_active: true, platform_status: "active" },
  ],
  error: null,
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("requireAccountContext", () => {
  it("rejects requestedAccountId that does not match the active account", async () => {
    const { client } = makeClient({ user: { id: "user-1" }, accounts: ACTIVE_A });
    createClient.mockReturnValue(client);

    await expect(
      requireAccountContext({ requestedAccountId: "acct-b" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("accepts a requestedAccountId matching the active account", async () => {
    const { client } = makeClient({
      user: { id: "user-1" },
      accounts: {
        data: [
          { account_id: "acct-a", name: "A", role: "agent", status: "active", is_active: true, platform_status: "active" },
        ],
        error: null,
      },
    });
    createClient.mockReturnValue(client);

    const ctx = await requireAccountContext({
      requestedAccountId: "acct-a",
      allowedRoles: "agent",
    });
    expect(ctx.accountId).toBe("acct-a");
  });

  it("still throws Unauthorized without session", async () => {
    const { client } = makeClient({ user: null });
    createClient.mockReturnValue(client);
    await expect(requireAccountContext()).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });
});
