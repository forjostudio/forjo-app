import crypto from 'crypto'

// Craftea un x-signature válido replicando BYTE A BYTE el manifest de producción
// (lib/mercadopago.ts:62-68): `id:<dataId lowercased>;request-id:<x-request-id>;ts:<ts>;`
// con las partes ausentes omitidas. Si el HMAC no coincidiera exactamente, verifyMPSignature
// devolvería false y el test daría un 401 falso (no probaría nada real).
//
// Para una firma INVÁLIDA: pasar un secret distinto (HMAC distinto) o mutar el v1 devuelto,
// o directamente no setear el header x-signature en la request.
export function craftSignature(opts: {
  secret: string
  dataId?: string | number // se lowercasea igual que en producción (no-op para ids numéricos)
  requestId?: string // va al header x-request-id y entra al manifest si está presente
  ts?: string // unix segundos; default ahora
}): { xSignature: string; xRequestId?: string } {
  const ts = opts.ts ?? String(Math.floor(Date.now() / 1000))
  const id = opts.dataId != null ? String(opts.dataId).toLowerCase() : undefined

  // Mismo orden y mismas omisiones que verifyMPSignature.
  let manifest = ''
  if (id) manifest += `id:${id};`
  if (opts.requestId) manifest += `request-id:${opts.requestId};`
  manifest += `ts:${ts};`

  const v1 = crypto.createHmac('sha256', opts.secret).update(manifest).digest('hex')
  return { xSignature: `ts=${ts},v1=${v1}`, xRequestId: opts.requestId }
}
