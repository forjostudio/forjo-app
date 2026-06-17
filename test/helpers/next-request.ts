import { NextRequest } from 'next/server'

// Construye un NextRequest para ejercitar un handler de webhook sin levantar un servidor Next.
// El handler lee data.id del query string primero (con fallback al body), y la firma de los headers
// x-signature / x-request-id, así que el helper expone los tres.
export function makeWebhookRequest(opts: {
  baseUrl?: string
  dataIdQuery?: string // ?data.id=<...>  (la fuente primaria del manifest de la firma)
  xSignature?: string
  xRequestId?: string
  body: unknown
}): NextRequest {
  const url = new URL(
    opts.baseUrl ?? 'https://gestion.forjo.studio/api/payment/webhook/__test_slug'
  )
  if (opts.dataIdQuery) url.searchParams.set('data.id', opts.dataIdQuery)

  const headers = new Headers({ 'content-type': 'application/json' })
  // Solo seteamos los headers de firma si se pasan: omitir x-signature simula un POST sin firma → 401.
  if (opts.xSignature) headers.set('x-signature', opts.xSignature)
  if (opts.xRequestId) headers.set('x-request-id', opts.xRequestId)

  return new NextRequest(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(opts.body),
  })
}
