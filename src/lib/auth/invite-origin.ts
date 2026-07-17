/**
 * Resolve the public origin used when minting invite URLs.
 *
 * Ciclo 001-R: never trust an arbitrary Host / X-Forwarded-Host
 * without an allow-list (or an explicit NEXT_PUBLIC_SITE_URL).
 */

export class InviteOriginError extends Error {
  readonly status = 400 as const;
  constructor(message: string) {
    super(message);
    this.name = "InviteOriginError";
  }
}

function parseAllowList(): readonly string[] | null {
  const raw =
    process.env.ALLOWED_APP_ORIGINS?.trim() ||
    process.env.ALLOWED_INVITE_HOSTS?.trim();
  if (!raw) return null;
  const list = raw
    .split(",")
    .map((entry) => normalizeHost(entry))
    .filter(Boolean);
  return list.length > 0 ? list : null;
}

/** Strip scheme/port/path so allow-list entries stay comparable. */
export function normalizeHost(value: string): string {
  let v = value.trim().toLowerCase();
  if (!v) return "";
  // Allow full origins in ALLOWED_APP_ORIGINS.
  if (v.includes("://")) {
    try {
      v = new URL(v).host;
    } catch {
      return "";
    }
  }
  // Drop trailing slashes / paths mistakenly pasted.
  v = v.split("/")[0] ?? "";
  return v;
}

function isLocalDevHost(hostname: string): boolean {
  const host = hostname.split(":")[0] ?? "";
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

function isHostAllowed(
  hostname: string,
  allowList: readonly string[] | null,
): boolean {
  const normalized = normalizeHost(hostname);
  if (!normalized) return false;
  if (allowList) {
    return allowList.some((allowed) => {
      // Compare host without port OR with port.
      return (
        allowed === normalized ||
        allowed === normalized.split(":")[0] ||
        normalizeHost(allowed) === normalized.split(":")[0]
      );
    });
  }
  // No allow-list configured: only localhost is trusted for Host derivation.
  return isLocalDevHost(normalized);
}

/**
 * Returns a scheme+host origin with no trailing slash.
 * Throws InviteOriginError when the request host is not trusted.
 */
export function resolveInviteBaseUrl(request: Request): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const allowList = parseAllowList();
  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();

  if (forwardedHost && isHostAllowed(forwardedHost, allowList)) {
    return `${forwardedProto || "https"}://${forwardedHost}`;
  }

  const host = request.headers.get("host")?.trim();
  if (host && isHostAllowed(host, allowList)) {
    const reqProto = new URL(request.url).protocol.replace(":", "");
    return `${reqProto}://${host}`;
  }

  if (forwardedHost || host) {
    console.warn("[invite-origin] rejected untrusted host", {
      forwardedHost,
      host,
      allowList,
    });
  }

  throw new InviteOriginError(
    "Cannot build invite URL: set NEXT_PUBLIC_SITE_URL or ALLOWED_APP_ORIGINS",
  );
}
