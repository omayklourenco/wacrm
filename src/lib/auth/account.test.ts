import { afterEach, describe, expect, it, vi } from "vitest";

// getCurrentAccount resolves the caller's ACTIVE account context from
// the N:N `get_user_accounts` RPC (Ciclo 002-R / 003-R). These tests
// guard active membership selection, suspension fallback, and errors.

interface RpcCall {
  fn: string;
  args: unknown;
}

function makeClient(opts: {
  user: { id: string } | null;
  userErr?: unknown;
  accounts?: { data: unknown; error: unknown };
}) {
  const rpcCalls: RpcCall[] = [];
  const rpc = (fn: string, args?: unknown) => {
    rpcCalls.push({ fn, args });
    if (fn === "get_user_accounts") {
      return Promise.resolve(opts.accounts ?? { data: [], error: null });
    }
    return Promise.resolve({ data: null, error: null });
  };

  return {
    rpcCalls,
    client: {
      auth: {
        getUser: () =>
          Promise.resolve({
            data: { user: opts.user },
            error: opts.userErr ?? null,
          }),
      },
      rpc,
    },
  };
}

const createClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => createClient(),
}));

const {
  getCurrentAccount,
  UnauthorizedError,
  ForbiddenError,
  NoActiveAccountError,
  AccountSuspendedError,
} = await import("./account");

afterEach(() => {
  vi.clearAllMocks();
});

describe("getCurrentAccount", () => {
  it("resolves the active membership from get_user_accounts", async () => {
    const { client, rpcCalls } = makeClient({
      user: { id: "user-1" },
      accounts: {
        data: [
          {
            account_id: "acct-1",
            name: "Acme",
            role: "owner",
            status: "active",
            is_active: true,
            platform_status: "active",
          },
          {
            account_id: "acct-2",
            name: "Beta",
            role: "agent",
            status: "active",
            is_active: false,
            platform_status: "active",
          },
        ],
        error: null,
      },
    });
    createClient.mockReturnValue(client);

    const ctx = await getCurrentAccount();

    expect(ctx).toMatchObject({
      userId: "user-1",
      accountId: "acct-1",
      role: "owner",
      membershipId: "acct-1:user-1",
      account: { id: "acct-1", name: "Acme" },
      platformStatus: "active",
    });
    expect(ctx.availableAccounts).toHaveLength(2);
    expect(rpcCalls.some((c) => c.fn === "set_active_account")).toBe(false);
  });

  it("falls back to the first membership and repairs the active pointer", async () => {
    const { client, rpcCalls } = makeClient({
      user: { id: "user-1" },
      accounts: {
        data: [
          {
            account_id: "acct-2",
            name: "Beta",
            role: "agent",
            status: "active",
            is_active: false,
            platform_status: "active",
          },
        ],
        error: null,
      },
    });
    createClient.mockReturnValue(client);

    const ctx = await getCurrentAccount();
    expect(ctx.accountId).toBe("acct-2");
    const switchCall = rpcCalls.find((c) => c.fn === "set_active_account");
    expect(switchCall?.args).toEqual({ p_account_id: "acct-2" });
  });

  it("skips a suspended active account and falls back to an operable one", async () => {
    const { client, rpcCalls } = makeClient({
      user: { id: "user-1" },
      accounts: {
        data: [
          {
            account_id: "acct-a",
            name: "A",
            role: "owner",
            status: "active",
            is_active: true,
            platform_status: "suspended",
          },
          {
            account_id: "acct-b",
            name: "B",
            role: "agent",
            status: "active",
            is_active: false,
            platform_status: "active",
          },
        ],
        error: null,
      },
    });
    createClient.mockReturnValue(client);

    const ctx = await getCurrentAccount();
    expect(ctx.accountId).toBe("acct-b");
    expect(ctx.platformStatus).toBe("active");
    expect(rpcCalls.some((c) => c.fn === "set_active_account")).toBe(true);
  });

  it("throws AccountSuspendedError when every membership is suspended", async () => {
    const { client } = makeClient({
      user: { id: "user-1" },
      accounts: {
        data: [
          {
            account_id: "acct-a",
            name: "A",
            role: "owner",
            status: "active",
            is_active: true,
            platform_status: "suspended",
          },
        ],
        error: null,
      },
    });
    createClient.mockReturnValue(client);
    await expect(getCurrentAccount()).rejects.toBeInstanceOf(
      AccountSuspendedError,
    );
  });

  it("throws UnauthorizedError when there is no session", async () => {
    const { client } = makeClient({ user: null });
    createClient.mockReturnValue(client);
    await expect(getCurrentAccount()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("maps an RPC error to 'Could not load account context'", async () => {
    const { client } = makeClient({
      user: { id: "user-1" },
      accounts: { data: null, error: { code: "XX000" } },
    });
    createClient.mockReturnValue(client);
    await expect(getCurrentAccount()).rejects.toThrow(
      "Could not load account context",
    );
  });

  it("throws NoActiveAccountError when the user has no memberships", async () => {
    const { client } = makeClient({
      user: { id: "user-1" },
      accounts: { data: [], error: null },
    });
    createClient.mockReturnValue(client);
    await expect(getCurrentAccount()).rejects.toBeInstanceOf(
      NoActiveAccountError,
    );
  });

  it("rejects an unknown role", async () => {
    const { client } = makeClient({
      user: { id: "user-1" },
      accounts: {
        data: [
          {
            account_id: "acct-1",
            name: "Acme",
            role: "superuser",
            status: "active",
            is_active: true,
            platform_status: "active",
          },
        ],
        error: null,
      },
    });
    createClient.mockReturnValue(client);
    await expect(getCurrentAccount()).rejects.toBeInstanceOf(ForbiddenError);
  });
});
