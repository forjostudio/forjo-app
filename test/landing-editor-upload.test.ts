import { describe, it, expect } from 'vitest'
import { buildUploadPath, validateImageFile } from '@/lib/landing/editor-upload'

// ── Tests puros del builder de path + validador de archivo del editor (Phase 14, EDIT-02) ──
// Espejan test/landing-theme.test.ts: describe/it/expect, import desde @/lib/..., SIN Supabase
// ni creds (no van bajo skipIf), environment 'node'. Cubren la BARRERA DE AISLAMIENTO del upload:
// el path SIEMPRE queda bajo el prefijo `{businessId}/` de la sesión (la RLS del bucket, migr. 030,
// rechaza cualquier path cuyo primer segmento no sea un business del owner — este test prueba el
// invariante del lado del cliente, verificable sin infra de Storage).
//
// Los strings de ATAQUE (section con `../`, con `/`, con caracteres raros) viven SOLO acá: es donde
// tiene sentido probar que la sanitización de la section NO deja escapar del prefijo. El módulo
// editor-upload.ts nunca los menciona.

// ── buildUploadPath: el primer segmento SIEMPRE es el businessId (T-14-09) ─────────────────
describe('buildUploadPath (aislamiento por prefijo businessId)', () => {
  it('el primer segmento del path es SIEMPRE el businessId recibido', () => {
    const ids = [
      '11111111-1111-1111-1111-111111111111',
      'ab12cd34-0000-0000-0000-abcdefabcdef',
      'business-xyz',
    ]
    for (const businessId of ids) {
      const path = buildUploadPath({ businessId, section: 'image', ext: 'jpg' })
      expect(path.split('/')[0]).toBe(businessId)
    }
  })

  it('el path tiene la forma `${businessId}/${sectionToken}-${uuid}.${ext}` (un solo segmento tras el id)', () => {
    const businessId = '11111111-1111-1111-1111-111111111111'
    const path = buildUploadPath({ businessId, section: 'gallery', ext: 'png' })
    // Exactamente 2 segmentos: [businessId, filename]. Nada de subcarpetas inyectadas.
    expect(path.split('/')).toHaveLength(2)
    expect(path).toMatch(
      new RegExp(`^${businessId}/gallery-[0-9a-f-]+\\.png$`),
    )
  })

  it('una section maliciosa con `../` NO escapa el prefijo del businessId', () => {
    const businessId = '11111111-1111-1111-1111-111111111111'
    const path = buildUploadPath({ businessId, section: '../otro-negocio', ext: 'jpg' })
    expect(path.split('/')[0]).toBe(businessId)
    expect(path.split('/')).toHaveLength(2) // la `../` no inyecta segmentos de path
    expect(path).not.toContain('..')
    expect(path).not.toContain('otro-negocio/')
  })

  it('una section con `/` embebido NO inyecta subcarpetas', () => {
    const businessId = 'biz-1'
    const path = buildUploadPath({ businessId, section: 'a/b/c', ext: 'webp' })
    expect(path.split('/')).toHaveLength(2)
    expect(path.split('/')[0]).toBe(businessId)
  })

  it('una section con caracteres raros se sanitiza a [a-z0-9-] y no rompe el path', () => {
    const businessId = 'biz-2'
    const path = buildUploadPath({ businessId, section: 'HERO!! Portada #$%', ext: 'JPG' })
    expect(path.split('/')[0]).toBe(businessId)
    expect(path.split('/')).toHaveLength(2)
    // token saneado a minúsculas y sin símbolos.
    expect(path).toMatch(new RegExp(`^${businessId}/[a-z0-9-]+-[0-9a-f-]+\\.jpg$`))
  })

  it('una section vacía / solo símbolos cae a un token de fallback (no deja el filename huérfano)', () => {
    const businessId = 'biz-3'
    const path = buildUploadPath({ businessId, section: '!!!', ext: 'png' })
    expect(path.split('/')[0]).toBe(businessId)
    expect(path.split('/')).toHaveLength(2)
    expect(path.split('/')[1].length).toBeGreaterThan(0)
  })

  it('la extensión se normaliza a minúsculas y sin punto inicial', () => {
    const businessId = 'biz-4'
    expect(buildUploadPath({ businessId, section: 'image', ext: 'PNG' })).toMatch(/\.png$/)
    expect(buildUploadPath({ businessId, section: 'image', ext: '.WebP' })).toMatch(/\.webp$/)
  })

  it('ext ausente cae a jpg (fallback)', () => {
    const businessId = 'biz-5'
    expect(buildUploadPath({ businessId, section: 'image' })).toMatch(/\.jpg$/)
  })

  it('genera un nombre único por llamada (uuid) — dos llamadas seguidas no colisionan', () => {
    const businessId = 'biz-6'
    const a = buildUploadPath({ businessId, section: 'image', ext: 'jpg' })
    const b = buildUploadPath({ businessId, section: 'image', ext: 'jpg' })
    expect(a).not.toBe(b)
  })
})

// ── validateImageFile: allowlist de tipo + límite de 2MB (T-14-11) ─────────────────────────
describe('validateImageFile (tipo + tamaño)', () => {
  const MB = 1024 * 1024

  it('acepta jpeg/png/webp de ≤ 2MB', () => {
    expect(validateImageFile({ size: 1 * MB, type: 'image/jpeg' })).toEqual({ ok: true })
    expect(validateImageFile({ size: 2 * MB, type: 'image/png' })).toEqual({ ok: true })
    expect(validateImageFile({ size: 500, type: 'image/webp' })).toEqual({ ok: true })
  })

  it('rechaza > 2MB con error "oversize"', () => {
    expect(validateImageFile({ size: 2 * MB + 1, type: 'image/jpeg' })).toEqual({
      ok: false,
      error: 'oversize',
    })
  })

  it('rechaza tipos fuera del allowlist con error "wrong_type"', () => {
    expect(validateImageFile({ size: 100, type: 'image/gif' })).toEqual({
      ok: false,
      error: 'wrong_type',
    })
    expect(validateImageFile({ size: 100, type: 'application/pdf' })).toEqual({
      ok: false,
      error: 'wrong_type',
    })
    expect(validateImageFile({ size: 100, type: 'text/html' })).toEqual({
      ok: false,
      error: 'wrong_type',
    })
    expect(validateImageFile({ size: 100, type: '' })).toEqual({
      ok: false,
      error: 'wrong_type',
    })
  })

  it('el tamaño se chequea antes que el tipo (un archivo grande y de tipo inválido → oversize)', () => {
    expect(validateImageFile({ size: 3 * MB, type: 'image/gif' })).toEqual({
      ok: false,
      error: 'oversize',
    })
  })
})
