// Matriz de render de servidor del organizador del catálogo (G-23-10a).
//
// POR QUÉ EXISTE: es la prueba de falsación de la sesión de debug de G-23-10a
// (`.planning/debug/chips-no-arrastrables-con-categorias-alfabetico.md`, evidencia 00:15), que se
// corrió a mano en un scratchpad. Acá queda automatizada para que el gate del chip no vuelva a
// atarse al modo de SERVICIOS: arrastrar un chip a otra categoría es asignar (D-05/D-06) y existe
// con cualquier modo mientras haya categorías; lo que depende del modo es ubicar (D-12/CAT-05).
//
// CÓMO: entorno `node` sin DOM y cero paquetes nuevos (mismo molde que
// components/booking/service-description.test.tsx), así que se renderiza con `renderToStaticMarkup`
// de react-dom y se cuentan atributos sobre el HTML. El render no escribe nada: `supabase` es un
// objeto vacío y los setters son funciones vacías.
//
// Las filas de categoría NO cambian con este gap: su arrastre, grip y flechas siguen atados al modo
// de las CATEGORÍAS. La matriz también congela eso.

import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Business, Service, ServiceCategory } from '@/lib/types'
import type { CategorySortMode, ServiceSortMode } from '@/lib/service-categories'
import { CategoriasManager } from './categorias-manager'

const BUSINESS_ID = 'b0000000-0000-4000-8000-000000000001'
const business = { id: BUSINESS_ID } as unknown as Business
const supabase = {} as unknown as SupabaseClient
const noop = () => {}

// sort_order NO alfabético a propósito: así el modo alpha reordena de verdad las filas.
const CATEGORIES: ServiceCategory[] = [
  { id: 'c-cortes', business_id: BUSINESS_ID, name: 'Cortes', sort_order: 0, created_at: '2026-09-01T00:00:00Z' },
  { id: 'c-barba', business_id: BUSINESS_ID, name: 'Barba', sort_order: 1, created_at: '2026-09-01T00:00:01Z' },
  { id: 'c-color', business_id: BUSINESS_ID, name: 'Color', sort_order: 2, created_at: '2026-09-01T00:00:02Z' },
]

function svc(id: string, name: string, price: number, category_id: string | null, sort_order: number): Service {
  return {
    id, business_id: BUSINESS_ID, name, price, duration_minutes: 30, description: null, active: true,
    capacity_mode: 'individual', capacity: 1, category_id, sort_order, created_at: '2026-09-01T00:00:00Z',
  } as Service
}

// 4 servicios repartidos en las categorías + 1 suelto.
const SERVICES: Service[] = [
  svc('s-corte', 'Corte clásico', 9000, 'c-cortes', 0),
  svc('s-fade', 'Fade', 11000, 'c-cortes', 1),
  svc('s-barba', 'Perfilado de barba', 6000, 'c-barba', 0),
  svc('s-color', 'Tintura', 15000, 'c-color', 0),
  svc('s-lavado', 'Lavado', 3000, null, 0),
]

function render(categories: ServiceCategory[], categorySortMode: CategorySortMode, serviceSortMode: ServiceSortMode): string {
  return renderToStaticMarkup(
    <CategoriasManager
      business={business}
      supabase={supabase}
      services={SERVICES}
      setServices={noop}
      categories={categories}
      setCategories={noop}
      categorySortMode={categorySortMode}
      setCategorySortMode={noop}
      serviceSortMode={serviceSortMode}
    />,
  )
}

const count = (html: string, re: RegExp) => (html.match(re) ?? []).length
const chipsArrastrables = (html: string) => count(html, /<button[^>]*draggable="true"/g)
const filasArrastrables = (html: string) => count(html, /<li[^>]*draggable="true"/g)
const grips = (html: string) => count(html, /<svg[^>]*class="[^"]*lucide-grip-vertical/g)

const MATRIZ: Array<[CategorySortMode, ServiceSortMode]> = [
  ['custom', 'custom'],
  ['alpha', 'custom'],
  ['custom', 'alpha'],
  ['alpha', 'alpha'],
  ['alpha', 'price'],
]

describe('CategoriasManager — el chip se arrastra para asignar con cualquier modo (G-23-10a)', () => {
  for (const [modoCategorias, modoServicios] of MATRIZ) {
    it(`categorías=${modoCategorias} · servicios=${modoServicios}: 5 chips arrastrables y el gate de filas intacto`, () => {
      const html = render(CATEGORIES, modoCategorias, modoServicios)
      const filas = modoCategorias === 'custom' ? 3 : 0
      expect(chipsArrastrables(html)).toBe(5)
      expect(filasArrastrables(html)).toBe(filas)
      expect(grips(html)).toBe(5 + filas)
    })
  }

  it('con cero categorías (Card colapsada, D-02) no hay nada arrastrable', () => {
    const html = render([], 'custom', 'custom')
    expect(html).not.toContain('draggable="true"')
  })
})
