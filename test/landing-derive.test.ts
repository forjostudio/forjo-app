import { describe, it, expect } from 'vitest'
import {
  heroData,
  aboutData,
  servicesData,
  galleryData,
  locationData,
  ctaData,
} from '@/lib/landing/schema'
import { parseLandingConfig } from '@/lib/landing/schema'
import {
  orderedSections,
  groupHoursByDay,
  DIAS,
  HOURS_RENDER_ORDER,
  shouldHideAbout,
  shouldHideServices,
  shouldHideGallery,
  shouldHideLocation,
  shouldHideHours,
  shouldHideCta,
} from '@/lib/landing/derive'
import type { Service, TimeBlock, Location } from '@/lib/types'

// ── Tests puros de la fundación de la Fase 7 (LAND-01/04/05) ─────────────────────
// Espejan test/landing-schema.test.ts: describe/it/expect, import desde @/lib/...,
// SIN Supabase ni creds (no van bajo skipIf). Cubren la lógica de decisión extraída
// a funciones puras para que el renderer y las secciones de la Wave 2 no la re-deriven.

// ── Task 1: tipos `data` por sección fail-safe (no rompen el envelope F6) ─────────
describe('per-section data schemas (.catch fail-safe)', () => {
  it('heroData parsea campos válidos', () => {
    const d = heroData.parse({ headline: 'x', image: 'https://h/i.png' })
    expect(d.headline).toBe('x')
    expect(d.image).toBe('https://h/i.png')
  })

  it('heroData con data malformado devuelve {} sin tirar (.catch)', () => {
    // tipo incorrecto (image numérico) → el .catch({}) devuelve {} en vez de lanzar.
    expect(() => heroData.parse({ image: 123 })).not.toThrow()
    expect(heroData.parse({ image: 123 })).toEqual({})
    // un string suelto tampoco rompe.
    expect(heroData.parse('basura')).toEqual({})
  })

  it('el envelope landingConfigSchema sigue permisivo con `data` arbitrario (F6 intacto)', () => {
    // Un `data` arbitrario NO debe tirar el config al DEFAULT por culpa del data:
    // el envelope mantiene data:z.unknown().optional().
    const cfg = {
      theme: { preset: 'x' },
      sections: [{ type: 'hero', enabled: true, order: 0, data: { cualquier: 'cosa', n: 123 } }],
    }
    expect(parseLandingConfig(cfg)).toEqual(cfg)
  })

  it('los demás esquemas por sección también son fail-safe', () => {
    expect(aboutData.parse({ body: 1 })).toEqual({})
    expect(servicesData.parse({ title: 5 })).toEqual({})
    expect(galleryData.parse({ images: 'no-array' })).toEqual({})
    expect(locationData.parse({ map_url: 9 })).toEqual({})
    expect(ctaData.parse({ headline: [] })).toEqual({})
    // válidos se respetan
    expect(galleryData.parse({ images: ['https://h/a.png'] }).images).toEqual(['https://h/a.png'])
    expect(locationData.parse({ show_address: true }).show_address).toBe(true)
  })
})

// ── Task 2 · LAND-01: orderedSections (filtro enabled + orden asc + booking siempre) ──
describe('orderedSections (LAND-01)', () => {
  it('filtra enabled=false y ordena por order asc', () => {
    const sections = [
      { type: 'cta' as const, enabled: true, order: 5 },
      { type: 'about' as const, enabled: false, order: 1 },
      { type: 'hero' as const, enabled: true, order: 0 },
      { type: 'booking' as const, enabled: true, order: 2 },
    ]
    const r = orderedSections(sections)
    expect(r.map((s) => s.type)).toEqual(['hero', 'booking', 'cta'])
  })

  it('inyecta booking al final si el config no la tiene', () => {
    const sections = [
      { type: 'hero' as const, enabled: true, order: 0 },
      { type: 'cta' as const, enabled: true, order: 1 },
    ]
    const r = orderedSections(sections)
    const booking = r.find((s) => s.type === 'booking')
    expect(booking).toBeDefined()
    expect(booking!.enabled).toBe(true)
    // queda al final del orden
    expect(r[r.length - 1].type).toBe('booking')
  })

  it('inyecta booking si la única booking estaba enabled:false (D7-05)', () => {
    const sections = [
      { type: 'hero' as const, enabled: true, order: 0 },
      { type: 'booking' as const, enabled: false, order: 1 },
    ]
    const r = orderedSections(sections)
    // la deshabilitada se filtró y se inyectó una habilitada → booking siempre presente
    const bookings = r.filter((s) => s.type === 'booking')
    expect(bookings).toHaveLength(1)
    expect(bookings[0].enabled).toBe(true)
    expect(r[r.length - 1].type).toBe('booking')
  })

  it('no duplica booking si ya hay una habilitada', () => {
    const sections = [
      { type: 'booking' as const, enabled: true, order: 1 },
      { type: 'hero' as const, enabled: true, order: 0 },
    ]
    const r = orderedSections(sections)
    expect(r.filter((s) => s.type === 'booking')).toHaveLength(1)
  })
})

// ── Task 2 · LAND-04: groupHoursByDay (agrupa time_blocks por día) ────────────────
describe('groupHoursByDay (LAND-04)', () => {
  const tb = (day_of_week: number, start_time: string, end_time: string): TimeBlock => ({
    id: `${day_of_week}-${start_time}`,
    business_id: 'b1',
    day_of_week,
    start_time,
    end_time,
    label: null,
    location_id: null,
    created_at: '2026-01-01',
  })

  it('agrupa por día y formatea HH:MM–HH:MM', () => {
    const map = groupHoursByDay([tb(1, '09:00:00', '13:00:00')])
    expect(map.get(1)).toEqual(['09:00–13:00'])
  })

  it('acumula múltiples rangos del mismo día', () => {
    const map = groupHoursByDay([
      tb(1, '09:00:00', '13:00:00'),
      tb(1, '16:00:00', '20:00:00'),
    ])
    expect(map.get(1)).toEqual(['09:00–13:00', '16:00–20:00'])
  })

  it('días distintos quedan en entradas distintas', () => {
    const map = groupHoursByDay([
      tb(1, '09:00:00', '13:00:00'),
      tb(6, '10:00:00', '14:00:00'),
    ])
    expect(map.get(1)).toEqual(['09:00–13:00'])
    expect(map.get(6)).toEqual(['10:00–14:00'])
    expect(map.has(0)).toBe(false)
  })

  it('array vacío → Map vacío', () => {
    expect(groupHoursByDay([]).size).toBe(0)
  })

  it('DIAS tiene 7 etiquetas y HOURS_RENDER_ORDER arranca el lunes y cierra el domingo', () => {
    expect(DIAS).toHaveLength(7)
    expect(DIAS[0]).toBe('Domingo')
    expect(HOURS_RENDER_ORDER).toEqual([1, 2, 3, 4, 5, 6, 0])
  })
})

// ── Task 2 · LAND-05: predicados de empty-state ──────────────────────────────────
describe('empty-state predicates (LAND-05)', () => {
  const svc = (id: string): Service => ({
    id,
    business_id: 'b1',
    name: 'Corte',
    duration_minutes: 30,
    price: 1000,
    description: null,
    active: true,
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

  it('shouldHideServices: vacío → true, con servicio → false', () => {
    expect(shouldHideServices([])).toBe(true)
    expect(shouldHideServices([svc('s1')])).toBe(false)
  })

  it('shouldHideAbout: sin body ni image → true; con alguno → false', () => {
    expect(shouldHideAbout({})).toBe(true)
    expect(shouldHideAbout({ body: 'hola' })).toBe(false)
    expect(shouldHideAbout({ image: 'https://h/a.png' })).toBe(false)
  })

  it('shouldHideGallery: sin images → true; con images → false', () => {
    expect(shouldHideGallery({})).toBe(true)
    expect(shouldHideGallery({ images: [] })).toBe(true)
    expect(shouldHideGallery({ images: ['https://h/a.png'] })).toBe(false)
  })

  it('shouldHideHours: sin time_blocks → true; con time_blocks → false', () => {
    expect(shouldHideHours([])).toBe(true)
    expect(
      shouldHideHours([
        {
          id: 't1',
          business_id: 'b1',
          day_of_week: 1,
          start_time: '09:00:00',
          end_time: '13:00:00',
          label: null,
          location_id: null,
          created_at: '2026-01-01',
        },
      ]),
    ).toBe(false)
  })

  it('shouldHideCta: sin headline ni whatsapp → true; con alguno → false', () => {
    expect(shouldHideCta({}, { whatsapp: null })).toBe(true)
    expect(shouldHideCta({ headline: 'Reservá' }, { whatsapp: null })).toBe(false)
    expect(shouldHideCta({}, { whatsapp: 'https://wa.me/549...' })).toBe(false)
  })

  it('shouldHideLocation: ninguna sede aporta dirección (con show_address) ni map_url → true', () => {
    // sin map_url y sin show_address → ocultar
    expect(shouldHideLocation({}, [loc({ address: 'Calle 1' })])).toBe(true)
    // address presente pero show_address=false → no se muestra dirección
    expect(shouldHideLocation({ show_address: false }, [loc({ address: 'Calle 1' })])).toBe(true)
    // sin sedes → ocultar
    expect(shouldHideLocation({}, [])).toBe(true)
  })

  it('shouldHideLocation: con map_url O dirección visible → false', () => {
    expect(shouldHideLocation({ map_url: 'https://maps/x' }, [])).toBe(false)
    expect(
      shouldHideLocation({ show_address: true }, [loc({ address: 'Calle 1' })]),
    ).toBe(false)
  })
})
