import { describe, expect, it } from "vitest";

import { sanitizeAuditMetadata } from "./platform-audit";

describe("sanitizeAuditMetadata", () => {
  it("keeps safe scalar fields and truncates long strings", () => {
    const out = sanitizeAuditMetadata({
      reason: "x".repeat(600),
      count: 3,
      ok: true,
    });
    expect(out.count).toBe(3);
    expect(out.ok).toBe(true);
    expect(String(out.reason).length).toBe(500);
  });

  it("strips secret-like keys", () => {
    const out = sanitizeAuditMetadata({
      reason: "abuse",
      token: "secret",
      access_token: "x",
      cookie: "y",
      service_role: "z",
    });
    expect(out).toEqual({ reason: "abuse" });
  });
});
