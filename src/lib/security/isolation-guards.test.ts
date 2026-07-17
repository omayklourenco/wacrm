import { describe, expect, it } from "vitest";
import { verifyMetaWebhookSignature } from "@/lib/whatsapp/webhook-signature";
import { encrypt, decrypt, isLegacyFormat } from "@/lib/whatsapp/encryption";
import {
  canEditSettings,
  canManageMembers,
  canSendMessages,
  canViewOnly,
  hasMinRole,
  type AccountRole,
} from "@/lib/auth/roles";
import { hashApiKey, API_KEY_PREFIX } from "@/lib/api-keys/keys";

/**
 * Ciclo 000-R — isolation / security unit guards.
 * These do not replace Supabase local RLS integration tests; they
 * lock critical contracts that prevent cross-tenant regressions.
 */

describe("Ciclo 000-R — Meta webhook HMAC", () => {
  const body = '{"object":"whatsapp_business_account"}';

  it("rejects missing signature header", () => {
    expect(verifyMetaWebhookSignature(body, null)).toBe(false);
  });

  it("rejects invalid signature", () => {
    expect(verifyMetaWebhookSignature(body, "sha256=deadbeef")).toBe(false);
  });

  it("accepts a valid HMAC-SHA256 signature", async () => {
    const crypto = await import("node:crypto");
    const secret = process.env.META_APP_SECRET!;
    const sig =
      "sha256=" +
      crypto.createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyMetaWebhookSignature(body, sig)).toBe(true);
  });
});

describe("Ciclo 000-R — token encryption", () => {
  it("round-trips AES-256-GCM", () => {
    const plain = "EAAG-test-token";
    const enc = encrypt(plain);
    expect(isLegacyFormat(enc)).toBe(false);
    expect(decrypt(enc)).toBe(plain);
  });

  it("fails closed on tampered ciphertext", () => {
    const enc = encrypt("secret");
    const parts = enc.split(":");
    parts[1] = parts[1].replace(/0/g, "1").replace(/1/g, "0");
    expect(() => decrypt(parts.join(":"))).toThrow();
  });
});

describe("Ciclo 000-R — RBAC hierarchy", () => {
  const roles: AccountRole[] = ["viewer", "agent", "admin", "owner"];

  it("viewer cannot mutate settings or members", () => {
    expect(canEditSettings("viewer")).toBe(false);
    expect(canManageMembers("viewer")).toBe(false);
    expect(canSendMessages("viewer")).toBe(false);
    expect(canViewOnly("viewer")).toBe(true);
  });

  it("agent can operate but not manage settings", () => {
    expect(canSendMessages("agent")).toBe(true);
    expect(canEditSettings("agent")).toBe(false);
    expect(canManageMembers("agent")).toBe(false);
  });

  it("admin can manage members and settings", () => {
    expect(canEditSettings("admin")).toBe(true);
    expect(canManageMembers("admin")).toBe(true);
  });

  it("hasMinRole respects ordinal ranking", () => {
    for (const role of roles) {
      expect(hasMinRole(role, "viewer")).toBe(true);
    }
    expect(hasMinRole("agent", "admin")).toBe(false);
    expect(hasMinRole("owner", "admin")).toBe(true);
  });
});

describe("Ciclo 000-R — API key binding contract", () => {
  it("hashes deterministically and uses live prefix", () => {
    const raw = `${API_KEY_PREFIX}isolation_probe`;
    expect(hashApiKey(raw)).toBe(hashApiKey(raw));
    expect(hashApiKey(raw)).not.toBe(hashApiKey(`${API_KEY_PREFIX}other`));
    expect(raw.startsWith(API_KEY_PREFIX)).toBe(true);
  });
});
