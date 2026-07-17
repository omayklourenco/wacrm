/**
 * Pure helpers for account-scoped Meta media access (Ciclo 001-R).
 */

export function mediaProxyPath(mediaId: string): string {
  return `/api/whatsapp/media/${mediaId}`;
}

/**
 * True when a stored messages.media_url refers to this Meta media id
 * via our proxy path (exact or with query string).
 */
export function mediaUrlMatchesProxy(
  mediaUrl: string | null | undefined,
  mediaId: string,
): boolean {
  if (!mediaUrl || !mediaId) return false;
  const expected = mediaProxyPath(mediaId);
  if (mediaUrl === expected) return true;
  // Tolerate absolute URLs that embed the proxy path.
  try {
    if (mediaUrl.includes("://")) {
      const u = new URL(mediaUrl);
      return u.pathname === expected || u.pathname.endsWith(expected);
    }
  } catch {
    /* ignore */
  }
  return mediaUrl.startsWith(`${expected}?`);
}

export function assertSafeMediaId(mediaId: string): boolean {
  // Meta media IDs are numeric strings; reject path traversal / odd shapes.
  return /^[A-Za-z0-9_-]{1,128}$/.test(mediaId);
}
