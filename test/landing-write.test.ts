import { describe, it, expect } from 'vitest'
import {
  parseLandingConfigForWrite,
  landingWriteColumns,
  MAX_CONFIG_BYTES,
} from '@/lib/landing/write'
import { parseLandingConfig, DEFAULT_LANDING_CONFIG, SECTION_TYPES } from '@/lib/landing/schema'
import type { LandingConfig } from '@/lib/landing/schema'

// ── Tests del WRITE path del landing_config (T-15-16) ──────────────────────────────────────────
// El punto entero de este archivo: leer y escribir tienen contratos OPUESTOS.
//   · READ  (parseLandingConfig)         → fail-safe. Config roto → degrada. /[slug] NUNCA 500ea.
//   · WRITE (parseLandingConfigForWrite) → reject-on-invalid. Input roto → invalid_config, no se
//                                          escribe nada. NUNCA un `{}` silencioso que borre la sección.
// Antes de T-15-16 el `data` de cada sección se persistía VERBATIM (sectionSchema.data = z.unknown()):
// era la raíz de clase del XSS de map_url (la allowlist de protocolo vivía solo en el render).

// Helper: envelope mínimo con UNA sección.
const wrap = (type: string, data?: unknown) => ({
  theme: { preset: 'forjo' },
  sections: [{ type, enabled: true, order: 0, ...(data === undefined ? {} : { data }) }],
})

// Devuelve el `data` de la primera sección del config parseado (o falla el test si rechazó).
function dataOfFirst(input: unknown): unknown {
  const r = parseLandingConfigForWrite(input)
  expect(r.ok, `esperaba que pasara el write path, dio: ${!r.ok ? r.error : ''}`).toBe(true)
  if (!r.ok) throw new Error('unreachable')
  const s = r.data.sections[0] as { data?: unknown }
  return s.data
}

describe('parseLandingConfigForWrite — los 8 tipos de sección conservan su data válido', () => {
  it('hero', () => {
    const data = {
      headline: 'Cortes con oficio',
      kicker: 'Palermo',
      subhead: 'Reservá en 30 segundos',
      image: 'https://cdn.test/hero.jpg',
      cta_label: 'Reservar',
    }
    expect(dataOfFirst(wrap('hero', data))).toEqual(data)
  })

  it('about', () => {
    const data = { title: 'Quiénes somos', body: 'Texto', image: 'https://cdn.test/a.jpg' }
    expect(dataOfFirst(wrap('about', data))).toEqual(data)
  })

  it('services', () => {
    const data = { title: 'Servicios', subtitle: 'Lo que hacemos' }
    expect(dataOfFirst(wrap('services', data))).toEqual(data)
  })

  it('gallery', () => {
    const data = { title: 'Galería', images: ['https://cdn.test/1.jpg', 'https://cdn.test/2.jpg'] }
    expect(dataOfFirst(wrap('gallery', data))).toEqual(data)
  })

  it('location', () => {
    const data = {
      title: 'Dónde estamos',
      map_url: 'https://maps.google.com/?q=forjo',
      show_address: true,
    }
    expect(dataOfFirst(wrap('location', data))).toEqual(data)
  })

  it('cta', () => {
    const data = {
      headline: 'Nos vemos',
      primary_label: 'Reservar turno',
      links: [{ label: 'Instagram', url: 'https://instagram.com/x' }],
    }
    expect(dataOfFirst(wrap('cta', data))).toEqual(data)
  })

  it('booking → rsvData (header/intro/images), NO un esquema propio', () => {
    const data = { header: 'El lugar', intro: 'Antes de reservar', images: ['https://cdn.test/r.jpg'] }
    expect(dataOfFirst(wrap('booking', data))).toEqual(data)
  })

  it('hours: sin data pasa, y `title` (lo único que lee el renderer) se conserva', () => {
    // El config real de prod trae hours SIN data. Pero buildLandingConfig puede emitir { title } y
    // hours.tsx lo lee → rechazarlo dejaría a ese dueño sin poder guardar NUNCA.
    expect(dataOfFirst(wrap('hours', { title: 'Cuándo abrimos' }))).toEqual({ title: 'Cuándo abrimos' })
    const sinData = parseLandingConfigForWrite(wrap('hours'))
    expect(sinData.ok).toBe(true)
    if (sinData.ok) expect(sinData.data.sections[0]).toEqual({ type: 'hours', enabled: true, order: 0 })
  })

  it('los 8 tipos del enum están mapeados (fail-closed: un tipo sin esquema no pasaría)', () => {
    for (const type of SECTION_TYPES) {
      expect(parseLandingConfigForWrite(wrap(type, {})).ok, `type sin mapear: ${type}`).toBe(true)
    }
  })
})

// El test que impide la regresión más cara: si el fix estripara estos campos, el dueño perdería su
// ajuste fino de tipografía/opacidad del hero (son campos REALES del config de producción).
describe('hero — los ajustes de presentación del CMS sobreviven al write path', () => {
  it('conserva image_opacity, headline_scale, subhead_scale y kicker_scale', () => {
    const data = {
      headline: 'Titular',
      image: 'https://cdn.test/hero.jpg',
      image_opacity: 65,
      headline_scale: 120,
      subhead_scale: 95,
      kicker_scale: 110,
    }
    expect(dataOfFirst(wrap('hero', data))).toEqual(data)
  })
})

describe('claves desconocidas dentro de `data` → ESTRIPADAS (la promesa de write.ts ahora es verdad)', () => {
  it('hero: una clave que no existe en el esquema no se persiste', () => {
    const d = dataOfFirst(wrap('hero', { headline: 'Hola', __evil: '<script>', otra: 1 })) as object
    expect(d).toEqual({ headline: 'Hola' })
    expect(d).not.toHaveProperty('__evil')
  })

  it('booking: el `title` de los configs viejos es dato muerto y se estripa (rsvData no lo tiene)', () => {
    const d = dataOfFirst(wrap('booking', { title: 'Reservá', header: 'El lugar' }))
    expect(d).toEqual({ header: 'El lugar' })
  })

  it('el envelope sigue estripando sus propias claves desconocidas', () => {
    const r = parseLandingConfigForWrite({ ...wrap('hero', {}), extra: 'drop' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data).not.toHaveProperty('extra')
  })
})

// EL cierre real de la clase del XSS: el `javascript:` ya no llega a la DB, no solo al render.
describe('URLs peligrosas — RECHAZADAS POR EL WRITE PATH, no solo por el render', () => {
  it('location.map_url con javascript:/data:/file: → invalid_config (no se persiste)', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,<script>a()</script>', 'file:///etc/passwd']) {
      const r = parseLandingConfigForWrite(wrap('location', { title: 'X', map_url: url }))
      expect(r.ok, `no debe persistirse: ${url}`).toBe(false)
      if (!r.ok) expect(r.error).toBe('invalid_config')
    }
  })

  it('imágenes (hero/about/gallery/booking) con data: URI → invalid_config', () => {
    const evil = 'data:text/html,<script>a()</script>'
    expect(parseLandingConfigForWrite(wrap('hero', { image: evil })).ok).toBe(false)
    expect(parseLandingConfigForWrite(wrap('about', { image: evil })).ok).toBe(false)
    expect(parseLandingConfigForWrite(wrap('gallery', { images: [evil] })).ok).toBe(false)
    expect(parseLandingConfigForWrite(wrap('booking', { images: [evil] })).ok).toBe(false)
  })

  it('un href javascript: en los botones del CTA no se persiste (el ítem se filtra)', () => {
    const d = dataOfFirst(
      wrap('cta', {
        headline: 'Hola',
        links: [
          { label: 'Bueno', url: 'https://instagram.com/x' },
          { label: 'Malo', url: 'javascript:alert(1)' },
        ],
      }),
    ) as { links?: unknown[] }
    expect(d.links).toEqual([{ label: 'Bueno', url: 'https://instagram.com/x' }])
  })
})

// El contrato reject-vs-degrade: un `data` con la forma equivocada RECHAZA. Si degradara a {} en la
// escritura, el dueño perdería la sección entera EN SILENCIO — peor que el bug original.
describe('`data` con la forma equivocada → invalid_config, NUNCA un {} silencioso', () => {
  it('hero.data = "un string"', () => {
    const r = parseLandingConfigForWrite(wrap('hero', 'un string'))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('invalid_config')
  })

  it('gallery.images = 123', () => {
    const r = parseLandingConfigForWrite(wrap('gallery', { images: 123 }))
    expect(r.ok).toBe(false)
  })

  it('about.data = [] (array donde va un objeto)', () => {
    expect(parseLandingConfigForWrite(wrap('about', [])).ok).toBe(false)
  })

  it('hours.data = "Horarios" (string donde va un objeto)', () => {
    expect(parseLandingConfigForWrite(wrap('hours', 'Horarios')).ok).toBe(false)
  })

  it('el envelope roto sigue rechazando (theme inválido)', () => {
    const r = parseLandingConfigForWrite({ theme: 123, sections: [] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('invalid_config')
  })
})

describe('tope de tamaño (DoS auto-infligido: /[slug] es force-dynamic y lee el config en cada request)', () => {
  it('un config por encima de MAX_CONFIG_BYTES → config_too_large', () => {
    const r = parseLandingConfigForWrite(
      wrap('about', { title: 'X', body: 'a'.repeat(MAX_CONFIG_BYTES + 1) }),
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('config_too_large')
  })

  it('un config grande pero por debajo del tope pasa', () => {
    const r = parseLandingConfigForWrite(wrap('about', { body: 'a'.repeat(1000) }))
    expect(r.ok).toBe(true)
  })
})

// El config REAL de producción (8 secciones, /estudio-test). Si el write path lo rechazara, el dueño
// quedaría SIN PODER GUARDAR NUNCA — un incidente peor que el bug que este fix cierra.
describe('el config REAL de producción sigue validando contra el write path', () => {
  const PROD_LIKE = {
    theme: { preset: 'forjo', overrides: { palette: 'ocre', font: 'serif' } },
    motion: 'premium',
    sections: [
      {
        type: 'hero',
        enabled: true,
        order: 0,
        data: {
          headline: 'Estudio Test',
          kicker: 'Palermo, CABA',
          subhead: 'Turnos online, sin llamadas',
          image: 'https://xyz.supabase.co/storage/v1/object/public/landing-assets/biz/hero.jpg',
          cta_label: 'Reservar',
          image_opacity: 80,
          headline_scale: 115,
          kicker_scale: 100,
          subhead_scale: 95,
        },
      },
      { type: 'about', enabled: true, order: 1, data: { title: 'Sobre nosotros', body: 'Texto real.' } },
      { type: 'services', enabled: true, order: 2, data: { title: 'Servicios' } },
      { type: 'hours', enabled: true, order: 3 }, // sin data (así viene de prod)
      {
        type: 'location',
        enabled: true,
        order: 4,
        data: { title: 'Dónde estamos', map_url: 'https://maps.app.goo.gl/abc', show_address: true },
      },
      {
        type: 'gallery',
        enabled: true,
        order: 5,
        data: {
          title: 'El lugar',
          images: [
            'https://xyz.supabase.co/storage/v1/object/public/landing-assets/biz/1.jpg',
            'https://xyz.supabase.co/storage/v1/object/public/landing-assets/biz/2.jpg',
          ],
        },
      },
      { type: 'cta', enabled: true, order: 6, data: { headline: 'Te esperamos' } },
      {
        type: 'booking',
        enabled: true,
        order: 7,
        data: {
          // `title` = dato muerto de los configs armados por la skill (rsvData no lo tiene y el
          // renderer ya lo ignora hoy). Se estripa: no se pierde nada visible.
          title: 'Reservá tu turno',
          header: 'Conocé el lugar',
          images: ['https://xyz.supabase.co/storage/v1/object/public/landing-assets/biz/r1.jpg'],
        },
      },
    ],
  }

  it('pasa el write path (no se rechaza un config ya publicado)', () => {
    const r = parseLandingConfigForWrite(PROD_LIKE)
    expect(r.ok).toBe(true)
  })

  it('conserva todo lo visible: copy, imágenes, ajustes del hero, map_url, motion y tema', () => {
    const r = parseLandingConfigForWrite(PROD_LIKE)
    if (!r.ok) throw new Error(`el config de prod fue rechazado: ${r.error}`)
    expect(r.data.theme).toEqual(PROD_LIKE.theme)
    expect(r.data.motion).toBe('premium')
    expect(r.data.sections).toHaveLength(8)
    const hero = r.data.sections[0] as { data: Record<string, unknown> }
    expect(hero.data).toEqual(PROD_LIKE.sections[0].data) // incluidas las 4 escalas/opacidad
    const booking = r.data.sections[7] as { data: Record<string, unknown> }
    expect(booking.data).toEqual({ header: 'Conocé el lugar', images: PROD_LIKE.sections[7].data!.images })
    expect(booking.data).not.toHaveProperty('title') // el único campo que se pierde: dato muerto
  })
})

// Regresión del fail-safe: el READ path NO cambió. La web pública sigue degradando, no tirando.
describe('el read path sigue siendo fail-safe (no lo rompimos)', () => {
  it('un config roto degrada al DEFAULT en vez de tirar', () => {
    expect(() => parseLandingConfig({ theme: 123 })).not.toThrow()
    expect(parseLandingConfig({ theme: 123 })).toEqual(DEFAULT_LANDING_CONFIG)
  })

  it('un map_url javascript: NO tira la página (la sección degrada), aunque el write lo rechace', () => {
    const roto = wrap('location', { map_url: 'javascript:alert(1)' })
    expect(parseLandingConfig(roto)).not.toBeNull() // render: sobrevive
    expect(parseLandingConfigForWrite(roto).ok).toBe(false) // escritura: rechaza
  })

  it('null sigue devolviendo null (passthrough legacy)', () => {
    expect(parseLandingConfig(null)).toBeNull()
  })
})

// ── landingWriteColumns (Phase 16, SKILL-07 / D-03 / D-03b) ─────────────────────────────────────
// La decisión que sostiene la fase entera: la web que arma el operador NACE COMO BORRADOR. El
// default NO puede tocar `landing_config` — si lo tocara, correr la skill sobre un negocio ya
// publicado le pisaría la web AL AIRE sin que nadie la mire (T-16-01). Vive en un módulo puro y no
// inline en scripts/setup-landing.ts justamente para que exista este test: el script no es
// unit-testeable (side-effects, process.argv, service-role).
describe('landingWriteColumns (qué columnas escribe el operador según --publish)', () => {
  // Config válido real, salido del propio write path (no un objeto a mano).
  function validConfig(): LandingConfig {
    const r = parseLandingConfigForWrite(wrap('hero', { headline: 'Cortes con oficio' }))
    if (!r.ok) throw new Error('el config de prueba debería ser válido')
    return r.data
  }

  it('por defecto (publish=false) escribe SOLO landing_draft', () => {
    const cfg = validConfig()
    expect(Object.keys(landingWriteColumns(cfg, false))).toEqual(['landing_draft'])
  })

  it('por defecto la clave landing_config NO EXISTE en el payload (T-16-01)', () => {
    // `in`, no `=== undefined`: PostgREST manda las claves PRESENTES. Un `landing_config: undefined`
    // explícito es una fuente de bugs — la clave no tiene que estar, ni siquiera vacía.
    const r = landingWriteColumns(validConfig(), false)
    expect('landing_config' in r).toBe(false)
  })

  it('por defecto landing_draft es EL MISMO objeto parseado (sin clonar)', () => {
    const cfg = validConfig()
    expect(landingWriteColumns(cfg, false).landing_draft).toBe(cfg)
  })

  it('con --publish escribe las DOS columnas', () => {
    const r = landingWriteColumns(validConfig(), true)
    expect(Object.keys(r).sort()).toEqual(['landing_config', 'landing_draft'])
  })

  it('con --publish las dos columnas son EL MISMO objeto (invariante D-03b, incidente f98ed6b)', () => {
    // Byte-idénticas ⇒ el dueño abre su editor en "✓ Publicado" y no en un falso "sin publicar"
    // cuyo botón Publicar revertiría la web que el operador acaba de publicar.
    const cfg = validConfig()
    const r = landingWriteColumns(cfg, true)
    expect(r.landing_draft).toBe(cfg)
    expect(r.landing_config).toBe(cfg)
    expect(r.landing_config).toBe(r.landing_draft)
  })

  it('es pura: no muta el config recibido', () => {
    const cfg = validConfig()
    const snap = structuredClone(cfg)
    landingWriteColumns(cfg, false)
    landingWriteColumns(cfg, true)
    expect(cfg).toEqual(snap)
  })
})
