import { describe, it, expect } from 'vitest'
import {
  verticalToSchemaType,
  buildMetadataParts,
  buildJsonLd,
} from '@/lib/landing/seo'
import type { VerticalKey } from '@/lib/verticals'
import type { Location, TimeBlock } from '@/lib/types'

// ── Tests puros de los helpers de SEO de la Fase 9 (SEO-01/03/05) ─────────────────
// Espejan test/landing-derive.test.ts: describe/it/expect, import desde @/lib/...,
// SIN Supabase ni creds (no van bajo skipIf, environment node). Cubren el mapeo de
// vertical, los caps/fallbacks de title/description, la derivación de
// openingHoursSpecification, el fallback de telephone, y el fail-safe total.

// Fixtures inline tipados (mismo estilo que landing-derive.test.ts).
const tb = (day_of_week: number, start_time: string, end_time: string): TimeBlock => ({
  id: `${day_of_week}-${start_time}`,
  business_id: 'b1',
  day_of_week,
  start_time,
  end_time,
  label: null,
  location_id: null,
  capacity: 1,
  created_at: '2026-01-01',
})

const loc = (over: Partial<Location> = {}): Location => ({
  id: 'l1',
  business_id: 'b1',
  name: 'Sede',
  address: null,
  phone: null,
  is_active: true,
  created_at: '2026-01-01',
  ...over,
})

// Helper para armar un landing_config con una sección hero y su data.
const cfgWithHero = (data: Record<string, unknown>) => ({
  theme: { preset: 'forjo' },
  sections: [{ type: 'hero', enabled: true, order: 0, data }],
})

// ── SEO-03: verticalToSchemaType ─────────────────────────────────────────────────
describe('verticalToSchemaType (SEO-03, D9-02)', () => {
  it('mapea los 3 verticales conocidos', () => {
    expect(verticalToSchemaType('salud')).toBe('MedicalClinic')
    expect(verticalToSchemaType('belleza')).toBe('BeautySalon')
    expect(verticalToSchemaType('general')).toBe('LocalBusiness')
  })

  it('un vertical fuera del set cae a LocalBusiness (fallback)', () => {
    // Forzamos un valor inválido por cast para simular vertical legacy/desconocido.
    expect(verticalToSchemaType('otro' as VerticalKey)).toBe('LocalBusiness')
    expect(verticalToSchemaType(undefined as unknown as VerticalKey)).toBe('LocalBusiness')
  })
})

// ── SEO-01 / SEO-05: buildMetadataParts ──────────────────────────────────────────
describe('buildMetadataParts (SEO-01/SEO-05)', () => {
  it('con hero.headline → title "{name} — {headline}"', () => {
    const { title } = buildMetadataParts({
      business: { name: 'Peluquería Sol', vertical: 'belleza' },
      landingConfig: cfgWithHero({ headline: 'Cortes con onda' }),
    })
    expect(title).toBe('Peluquería Sol — Cortes con onda')
  })

  it('sin headline → title "{name} — Reservar turno"', () => {
    const { title } = buildMetadataParts({
      business: { name: 'Peluquería Sol', vertical: 'belleza' },
      landingConfig: cfgWithHero({}),
    })
    expect(title).toBe('Peluquería Sol — Reservar turno')
  })

  it('title largo se acota a ~60 caracteres con elipsis', () => {
    const { title } = buildMetadataParts({
      business: { name: 'Centro Estético Premium Buenos Aires Argentina', vertical: 'belleza' },
      landingConfig: cfgWithHero({ headline: 'La mejor experiencia de belleza y bienestar integral' }),
    })
    expect(title.length).toBeLessThanOrEqual(60)
    expect(title.endsWith('…')).toBe(true)
  })

  it('con hero.subhead → description = subhead', () => {
    const { description } = buildMetadataParts({
      business: { name: 'Peluquería Sol', vertical: 'belleza' },
      landingConfig: cfgWithHero({ subhead: 'Reservá online en segundos.' }),
    })
    expect(description).toBe('Reservá online en segundos.')
  })

  it('sin subhead → template-por-vertical que contiene el name', () => {
    const { description } = buildMetadataParts({
      business: { name: 'Consultorio López', vertical: 'salud' },
      landingConfig: cfgWithHero({}),
    })
    expect(description).toContain('Consultorio López')
  })

  it('description larga se acota a ~160 caracteres', () => {
    const longSubhead = 'a'.repeat(300)
    const { description } = buildMetadataParts({
      business: { name: 'X', vertical: 'general' },
      landingConfig: cfgWithHero({ subhead: longSubhead }),
    })
    expect(description.length).toBeLessThanOrEqual(160)
  })

  it('fail-safe: config null/undefined no tira y devuelve fallbacks por nombre (SEO-05)', () => {
    for (const bad of [null, undefined]) {
      const { title, description } = buildMetadataParts({
        business: { name: 'Negocio Legacy', vertical: null },
        landingConfig: bad,
      })
      expect(title).toBe('Negocio Legacy — Reservar turno')
      expect(description).toContain('Negocio Legacy')
    }
  })

  it('fail-safe: config basura ({} / string / hero.data roto) no tira (SEO-05)', () => {
    const inputs: unknown[] = [
      {},
      'basura',
      123,
      { sections: 'no-array' },
      cfgWithHero({ headline: 123 }), // data malformado → heroData.catch({}) → fallbacks
    ]
    for (const bad of inputs) {
      expect(() =>
        buildMetadataParts({ business: { name: 'Forjo', vertical: 'general' }, landingConfig: bad }),
      ).not.toThrow()
      const { title } = buildMetadataParts({
        business: { name: 'Forjo', vertical: 'general' },
        landingConfig: bad,
      })
      expect(title).toBe('Forjo — Reservar turno')
    }
  })
})

// ── SEO-03 / SEO-05: buildJsonLd ─────────────────────────────────────────────────
describe('buildJsonLd (SEO-03/SEO-05)', () => {
  const base = {
    business: { name: 'Clínica Centro', whatsapp: null },
    locations: [] as Location[],
    timeBlocks: [] as TimeBlock[],
    vertical: 'salud' as VerticalKey,
    url: 'https://gestion.forjo.studio/clinica',
  }

  it('@type correcto por vertical + campos base', () => {
    const r = buildJsonLd(base)!
    expect(r['@context']).toBe('https://schema.org')
    expect(r['@type']).toBe('MedicalClinic')
    expect(r.name).toBe('Clínica Centro')
    expect(r.url).toBe('https://gestion.forjo.studio/clinica')
    expect(buildJsonLd({ ...base, vertical: 'belleza' })!['@type']).toBe('BeautySalon')
    expect(buildJsonLd({ ...base, vertical: 'general' })!['@type']).toBe('LocalBusiness')
  })

  it('con locations + timeBlocks → address/telephone/openingHoursSpecification presentes', () => {
    const r = buildJsonLd({
      ...base,
      locations: [loc({ address: 'Av. Siempreviva 742', phone: '+5491155550000' })],
      timeBlocks: [tb(1, '09:00:00', '13:00:00')],
    })!
    expect(r.address).toEqual({ '@type': 'PostalAddress', streetAddress: 'Av. Siempreviva 742' })
    expect(r.telephone).toBe('+5491155550000')
    expect(r.openingHoursSpecification).toEqual([
      { '@type': 'OpeningHoursSpecification', dayOfWeek: 'Monday', opens: '09:00', closes: '13:00' },
    ])
  })

  it('openingHoursSpecification: dayOfWeek en inglés por índice (0=Sunday..6=Saturday)', () => {
    const r = buildJsonLd({
      ...base,
      timeBlocks: [tb(0, '10:00:00', '14:00:00'), tb(6, '08:00:00', '12:00:00')],
    })!
    const days = r.openingHoursSpecification!.map((s) => s.dayOfWeek)
    expect(days).toContain('Sunday')
    expect(days).toContain('Saturday')
  })

  it('sin address → campo address ausente (no null)', () => {
    const r = buildJsonLd({ ...base, locations: [loc({ phone: '+541100000000' })] })!
    expect('address' in r).toBe(false)
  })

  it('sin timeBlocks → openingHoursSpecification ausente', () => {
    const r = buildJsonLd(base)!
    expect('openingHoursSpecification' in r).toBe(false)
  })

  it('telephone usa location.phone cuando hay', () => {
    const r = buildJsonLd({
      ...base,
      business: { name: 'X', whatsapp: 'https://wa.me/5491199998888' },
      locations: [loc({ phone: '+541144443333' })],
    })!
    expect(r.telephone).toBe('+541144443333')
  })

  it('telephone cae a business.whatsapp (sin prefijo wa.me) cuando no hay location.phone', () => {
    const r = buildJsonLd({
      ...base,
      business: { name: 'X', whatsapp: 'https://wa.me/5491199998888' },
      locations: [loc({ phone: null })],
    })!
    // schema.org telephone espera número, no URL → se strippea el prefijo wa.me.
    expect(r.telephone).toBe('5491199998888')
  })

  it('sin name → devuelve null (no emite script vacío)', () => {
    expect(buildJsonLd({ ...base, business: { name: '', whatsapp: null } })).toBeNull()
    expect(buildJsonLd({ ...base, business: { name: null, whatsapp: null } })).toBeNull()
  })

  it('fail-safe: input null/legacy no tira (SEO-05)', () => {
    // locations/timeBlocks como null (legacy) no deben romper: se tratan como vacíos.
    expect(() =>
      buildJsonLd({
        ...base,
        locations: null as unknown as Location[],
        timeBlocks: null as unknown as TimeBlock[],
      }),
    ).not.toThrow()
    const r = buildJsonLd({
      ...base,
      locations: null as unknown as Location[],
      timeBlocks: null as unknown as TimeBlock[],
    })!
    expect(r.name).toBe('Clínica Centro')
    expect('address' in r).toBe(false)
    expect('openingHoursSpecification' in r).toBe(false)
  })
})
