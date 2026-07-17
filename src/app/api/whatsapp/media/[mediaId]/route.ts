import { NextResponse } from 'next/server'
import { requireAccountContext, toErrorResponse } from '@/lib/auth/account'
import { getMediaUrl, downloadMedia } from '@/lib/whatsapp/meta-api'
import { decrypt } from '@/lib/whatsapp/encryption'
import {
  assertSafeMediaId,
  mediaProxyPath,
} from '@/lib/whatsapp/media-access'

/**
 * Authenticated media proxy — Ciclo 001-R.
 *
 * Access requires:
 *   1. signed-in membership (any role),
 *   2. a messages.media_url in the caller's account that references
 *      this Meta media id via our proxy path,
 *   3. WhatsApp config for that same account.
 *
 * Media IDs alone are never enough — knowing a Meta media id must not
 * let a user pull media from another tenant's WABA token.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ mediaId: string }> },
) {
  try {
    const { mediaId } = await params

    if (!mediaId || !assertSafeMediaId(mediaId)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const ctx = await requireAccountContext()

    const proxyPath = mediaProxyPath(mediaId)

    // Bind media → message → conversation → account (caller).
    const { data: owned, error: ownedErr } = await ctx.supabase
      .from('messages')
      .select('id, conversation_id, conversations!inner(account_id)')
      .eq('media_url', proxyPath)
      .eq('conversations.account_id', ctx.accountId)
      .limit(1)
      .maybeSingle()

    if (ownedErr) {
      console.error('[media proxy] ownership lookup failed')
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (!owned) {
      // Generic 404 — do not reveal whether the media exists elsewhere.
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const { data: config, error: configError } = await ctx.supabase
      .from('whatsapp_config')
      .select('access_token')
      .eq('account_id', ctx.accountId)
      .maybeSingle()

    if (configError || !config?.access_token) {
      return NextResponse.json(
        { error: 'WhatsApp not configured' },
        { status: 400 },
      )
    }

    const accessToken = decrypt(config.access_token)
    const mediaInfo = await getMediaUrl({ mediaId, accessToken })
    const { buffer, contentType } = await downloadMedia({
      downloadUrl: mediaInfo.url,
      accessToken,
    })

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type':
          contentType || mediaInfo.mimeType || 'application/octet-stream',
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}
