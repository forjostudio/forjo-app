// ── Lógica pura del upload de imágenes del editor (Phase 14, EDIT-02) ──────────────────────
// Por qué este módulo: el upload real (browser session client → Supabase Storage) no es
// unit-testeable sin infra de Storage (el Storage local está OFF). La estrategia Nyquist es
// EXTRAER acá las dos barreras verificables sin infra — la CONSTRUCCIÓN DEL PATH (la garantía de
// aislamiento) y la VALIDACIÓN DEL ARCHIVO (tipo/tamaño) — a funciones PURAS y testear esas.
// Reglas duras (igual que lib/landing/derive.ts y lib/landing/theme.ts): SIN React, SIN Supabase,
// SIN admin client, sin 'use client'. Named exports.

// ── validateImageFile: allowlist de tipo + límite de 2MB (T-14-11) ─────────────────────────
// Reusa VERBATIM las reglas del control de logo en settings-client.tsx (2MB, jpeg/png/webp): es la
// misma barrera de input que ya corre en producción. El tamaño se chequea primero (barato) y luego
// el tipo. Es la PRIMERA barrera (defensa en profundidad); la no-bypasseable es Zod server-side al
// Guardar (`z.string().url()` sobre la publicUrl), pero validar acá evita subir basura al bucket.
const MAX_BYTES = 2 * 1024 * 1024 // 2 MB — idéntico a settings (handleLogoSelect)
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export type ValidateResult = { ok: true } | { ok: false; error: 'oversize' | 'wrong_type' }

// Acepta cualquier objeto con { size, type } (File estructuralmente encaja) para testear sin
// polyfill de File en el environment 'node'.
export function validateImageFile(file: { size: number; type: string }): ValidateResult {
  if (file.size > MAX_BYTES) return { ok: false, error: 'oversize' }
  if (!ALLOWED_TYPES.has(file.type)) return { ok: false, error: 'wrong_type' }
  return { ok: true }
}

// ── sanitizeToken: reduce un string libre a un token seguro de path [a-z0-9-] ───────────────
// Por qué: la `section` y la `ext` se interpolan dentro del filename. Si se dejaran crudas, un
// valor con `/` o `..` podría inyectar SUBcarpetas y mover el objeto fuera del prefijo del
// businessId — rompiendo el invariante de aislamiento. Reducimos por ALLOWLIST (no blocklist): solo
// sobreviven minúsculas, dígitos y `-`; cualquier otra cosa se elimina. Si el resultado queda vacío,
// se usa un fallback para no dejar el filename huérfano.
function sanitizeToken(raw: string, fallback: string): string {
  const token = raw.toLowerCase().replace(/[^a-z0-9-]/g, '')
  return token.length > 0 ? token : fallback
}

// ── buildUploadPath: el path del objeto en el bucket landing-assets (T-14-09) ───────────────
// EL INVARIANTE DE AISLAMIENTO: el PRIMER segmento del path es SIEMPRE el `businessId` recibido
// (que la page pasó desde la SESIÓN — nunca un slug ni un id del cliente). La RLS INSERT del bucket
// (migr. 030) exige que `(storage.foldername(name))[1]` sea un business del owner autenticado; un
// path fuera del propio prefijo `{businessId}/` es RECHAZADO. Por eso el businessId se usa VERBATIM
// (no se sanitiza: es un UUID de confianza y alterarlo rompería el match de la policy) y la `section`
// SÍ se sanitiza (dato de presentación, podría llegar con `../`). El nombre es único por `uuid` para
// que `upsert:false` nunca colisione ni pise un objeto ajeno.
export function buildUploadPath({
  businessId,
  section,
  ext,
}: {
  businessId: string
  section: string
  ext?: string
}): string {
  const sectionToken = sanitizeToken(section, 'img')
  // ext puede venir con punto inicial (".png") o en mayúsculas ("JPG"); se normaliza y cae a 'jpg'.
  const extToken = sanitizeToken((ext ?? 'jpg').replace(/^\./, ''), 'jpg')
  const uuid = globalThis.crypto.randomUUID()
  return `${businessId}/${sectionToken}-${uuid}.${extToken}`
}
