import { afterEach, describe, expect, it, vi } from "vitest";
import {
  InviteOriginError,
  normalizeHost,
  resolveInviteBaseUrl,
} from "./invite-origin";

afterEach(() => {
  vi.unstubAllEnvs();
});

function req(headers: Record<string, string>, url = "http://localhost:3000/api") {
  return new Request(url, { headers });
}

describe("normalizeHost", () => {
  it("strips scheme and path from origins", () => {
    expect(normalizeHost("https://Flow.Example.com/app")).toBe("flow.example.com");
  });
});

describe("resolveInviteBaseUrl", () => {
  it("prefers NEXT_PUBLIC_SITE_URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://crm.example.com/");
    expect(
      resolveInviteBaseUrl(req({ host: "phishing.evil" })),
    ).toBe("https://crm.example.com");
  });

  it("rejects malicious Host when allow-list is set", () => {
    vi.stubEnv("ALLOWED_APP_ORIGINS", "https://crm.example.com");
    expect(() =>
      resolveInviteBaseUrl(req({ host: "phishing.evil" })),
    ).toThrow(InviteOriginError);
  });

  it("accepts allow-listed host", () => {
    vi.stubEnv("ALLOWED_APP_ORIGINS", "crm.example.com,staging.example.com");
    expect(
      resolveInviteBaseUrl(
        req(
          {
            host: "crm.example.com",
            "x-forwarded-proto": "https",
          },
          "https://crm.example.com/api",
        ),
      ),
    ).toBe("https://crm.example.com");
  });

  it("allows localhost without allow-list (dev)", () => {
    expect(
      resolveInviteBaseUrl(req({ host: "localhost:3000" })),
    ).toBe("http://localhost:3000");
  });

  it("rejects non-local Host when no SITE_URL and no allow-list", () => {
    expect(() =>
      resolveInviteBaseUrl(req({ host: "evil.example" })),
    ).toThrow(InviteOriginError);
  });
});
