import { describe, expect, it } from "vitest";
import {
  assertSafeMediaId,
  mediaProxyPath,
  mediaUrlMatchesProxy,
} from "./media-access";

describe("media-access", () => {
  it("builds the proxy path", () => {
    expect(mediaProxyPath("12345")).toBe("/api/whatsapp/media/12345");
  });

  it("matches exact proxy media urls", () => {
    expect(mediaUrlMatchesProxy("/api/whatsapp/media/12345", "12345")).toBe(
      true,
    );
    expect(mediaUrlMatchesProxy("/api/whatsapp/media/999", "12345")).toBe(
      false,
    );
  });

  it("rejects path traversal media ids", () => {
    expect(assertSafeMediaId("../etc/passwd")).toBe(false);
    expect(assertSafeMediaId("abc/def")).toBe(false);
    expect(assertSafeMediaId("1234567890")).toBe(true);
  });
});
