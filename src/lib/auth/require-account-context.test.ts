import { afterEach, describe, expect, it, vi } from "vitest";

interface BuilderCall {
  table: string;
  columns?: string;
  eqArgs: [string, unknown][];
}

function makeClient(opts: {
  user: { id: string } | null;
  userErr?: unknown;
  byTable: Record<string, { data: unknown; error: unknown }>;
}) {
  const calls: BuilderCall[] = [];

  const from = (table: string) => {
    const call: BuilderCall = { table, eqArgs: [] };
    calls.push(call);
    const builder = {
      select(columns: string) {
        call.columns = columns;
        return builder;
      },
      eq(col: string, val: unknown) {
        call.eqArgs.push([col, val]);
        return builder;
      },
      maybeSingle() {
        return Promise.resolve(
          opts.byTable[table] ?? { data: null, error: null },
        );
      },
    };
    return builder;
  };

  return {
    calls,
    client: {
      auth: {
        getUser: () =>
          Promise.resolve({
            data: { user: opts.user },
            error: opts.userErr ?? null,
          }),
      },
      from,
    },
  };
}

const createClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => createClient(),
}));

const {
  requireAccountContext,
  UnauthorizedError,
  ForbiddenError,
} = await import("./account");

afterEach(() => {
  vi.clearAllMocks();
});

describe("requireAccountContext", () => {
  it("rejects requestedAccountId that does not match membership", async () => {
    const { client } = makeClient({
      user: { id: "user-1" },
      byTable: {
        profiles: {
          data: { account_id: "acct-a", account_role: "admin" },
          error: null,
        },
        accounts: { data: { id: "acct-a", name: "A" }, error: null },
      },
    });
    createClient.mockReturnValue(client);

    await expect(
      requireAccountContext({ requestedAccountId: "acct-b" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("accepts matching requestedAccountId", async () => {
    const { client } = makeClient({
      user: { id: "user-1" },
      byTable: {
        profiles: {
          data: { account_id: "acct-a", account_role: "agent" },
          error: null,
        },
        accounts: { data: { id: "acct-a", name: "A" }, error: null },
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
    const { client } = makeClient({ user: null, byTable: {} });
    createClient.mockReturnValue(client);
    await expect(requireAccountContext()).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });
});
