import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ── Phase 01 / plan 01-03 — los invariantes del CABLEADO del menú (NAV-07 + NAV-08) ──────────────
// Suite PURA: sin Supabase, sin fixtures y sin gate de entorno → cae sola en el carril paralelo
// `pure` (test/suite-split.ts clasifica por los IMPORTS del archivo). Molde y helpers: copiados tal
// cual de test/panel-history-clients.test.ts, que a su vez los tomó de test/catalog-public.test.ts.
//
// POR QUÉ ESTA SUITE LEE CÓDIGO FUENTE EN VEZ DE RENDERIZAR: el entorno de Vitest de este repo es
// `node` (vitest.config.mts) — no hay DOM, no hay Testing Library, `Sidebar` llama `usePathname()` en
// su cuerpo y el milestone prohíbe agregar paquetes. El cableado no se puede probar montando el
// componente, así que se afirma leyendo la fuente.
//
// QUÉ CUBRE QUE `lib/panel-history.test.ts` NO PUEDE VER: aquella suite fija la POLÍTICA —que
// `panelNavMode` devuelve `push` desde el dashboard y `replace` entre secciones, y que
// `consumeOwnedPanelEntry` nunca hace `back()` sobre una entrada ajena. Ésta fija que el SIDEBAR LA
// CONSUME: la política puede estar perfecta y el `<Link>` seguir empujando siempre. Las dos hacen
// falta, exactamente por el mismo motivo que el plan 01-02 escribió para el call site del borrado.
//
// LA REGLA DE HONESTIDAD: cada barrido descuenta los comentarios ANTES de afirmar, y afirma PRIMERO
// que encontró algo. Un recorte vacío —porque el `.map` se renombró, porque el archivo se movió—
// tiene que FALLAR, no pasar. Este archivo es el caso extremo de esa regla: el sidebar está lleno de
// comentarios que nombran `push`, `replace` y `preventDefault` justamente para explicar la regla.

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

/** Borra comentarios JSX, de bloque y de línea, en ese orden. Preserva el `//` de las URLs. */
function sinComentarios(src: string): string {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/**
 * Recorta LA REGIÓN que arranca en `marcador`, balanceando llaves desde su primer `{`.
 *
 * POR QUÉ RECORTAR Y NO AFIRMAR SOBRE EL ARCHIVO: `sidebar.tsx` tiene ~280 líneas con dos `<Link>`,
 * un `<a>` externo y un `<button>`. "En algún lado del archivo aparece `panelNavMode`" no prueba que
 * el link del menú lo use.
 *
 * ⚠ Devuelve string VACÍO si no encuentra la región, y cada `it` lo afirma no vacío antes de seguir.
 */
function recorte(fuente: string, marcador: string): string {
  const at = fuente.indexOf(marcador)
  if (at === -1) return ''
  const abre = fuente.indexOf('{', at)
  if (abre === -1) return ''
  let profundidad = 0
  for (let i = abre; i < fuente.length; i++) {
    const ch = fuente[i]
    if (ch === '{') profundidad++
    else if (ch === '}') {
      profundidad--
      if (profundidad === 0) return fuente.slice(at, i + 1)
    }
  }
  return ''
}

const SIDEBAR = 'components/dashboard/sidebar.tsx'
const fuente = sinComentarios(read(SIDEBAR))

describe('el menú del panel consume la regla de historial en vez de decidirla (NAV-07)', () => {
  it('importa la regla del módulo único, y no reimplementa la raíz del panel', () => {
    expect(fuente).toContain("from '@/lib/panel-history'")
    expect(fuente).toContain('panelNavMode')
    // Si alguien compara la ruta a mano acá, hay dos fuentes de verdad de "cuál es la raíz" y la
    // Phase 2 va a re-decidir la política en su propio call site: el segundo dialecto.
    expect(fuente).not.toContain("=== '/dashboard'")
  })

  it('TODOS los <Link> del sidebar declaran su modo: ninguno queda empujando siempre', () => {
    // El invariante que sobrevive al futuro: agregar una fila nueva al menú sin pasarla por la regla
    // pone esto en rojo. Sin él, el próximo link se agrega con el default (push) y el atrás vuelve a
    // caer en la sección anterior, que es el pedido de julio deshecho en silencio.
    const links = fuente.match(/<Link\b/g) ?? []
    const conRegla = fuente.match(/replace=\{panelNavMode\(/g) ?? []
    expect(links.length).toBeGreaterThan(0)
    expect(conRegla.length).toBe(links.length)
  })

  it('la fila del menú calcula el modo con la ruta ACTUAL y el destino del item', () => {
    const fila = recorte(fuente, 'group.items.map(item =>')
    expect(fila).not.toBe('')
    expect(fila).toContain('replace={panelNavMode(')
    expect(fila).toContain('from: pathname')
    expect(fila).toContain('to: item.href')
  })
})

describe('el menú no sepulta subsecciones (NAV-08)', () => {
  const fila = recorte(fuente, 'group.items.map(item =>')

  it('la región de la fila existe (si no, todo lo de abajo pasaría por vacío)', () => {
    expect(fila).not.toBe('')
    expect(fila.length).toBeGreaterThan(200)
  })

  it('el guard de cambios sin guardar se evalúa PRIMERO y no se toca', () => {
    // No es un detalle de orden: si el consumo corriera antes, el `back()` ya habría salido de la
    // ficha cuando el diálogo pregunta "¿salir sin guardar?", y cancelar dejaría al dueño en otro
    // lado del que estaba.
    const nav = recorte(fila, 'onNavigate=')
    expect(nav).not.toBe('')
    expect(nav).toContain('requestNavigation')
    expect(nav).toContain('consumeOwnedPanelEntry')
    expect(nav.indexOf('requestNavigation')).toBeLessThan(nav.indexOf('consumeOwnedPanelEntry'))
  })

  it('el consumo sólo corre en la sección ACTIVA y PREVIENE la navegación', () => {
    const nav = recorte(fila, 'onNavigate=')
    expect(nav).not.toBe('')
    // `active &&`: consumir desde OTRA sección deshaaría una entrada que no tiene nada que ver.
    expect(nav).toMatch(/active\s*&&\s*consumeOwnedPanelEntry\(\)/)
    // ⚠ `history.back()` es ASÍNCRONO: hay que prevenir, no encadenar. Si esto se degradara a dejar
    // navegar (o a un `await` / `.then(` inventado), el router empujaría su entrada antes de que el
    // browser procese el pop y la ficha volvería a quedar enterrada — el bug entero, de vuelta.
    expect(nav).toMatch(/consumeOwnedPanelEntry\(\)\)\s*e\.preventDefault\(\)/)
    expect(nav).not.toContain('await consumeOwnedPanelEntry')
    expect(nav).not.toContain('consumeOwnedPanelEntry().then')
  })
})

describe('el sidebar no abre un segundo dialecto de historial', () => {
  it('cero mutaciones crudas de historial en todo el archivo', () => {
    // Criterio 4 del ROADMAP, extendido al menú: el único lugar donde se escribe historial es
    // `lib/panel-history.ts`. Un `history.back()` suelto acá es un `back()` sin las dos guardas.
    for (const crudo of ['pushState', 'replaceState', 'history.back', 'history.forward', 'history.go']) {
      expect(fuente).not.toContain(crudo)
    }
  })

  it('los tres archivos intocables de NAV-06 no se importan ni se tocan desde acá', () => {
    expect(fuente).not.toContain('@/lib/overlay-history')
    // El guard de cambios sin guardar SÍ se usa, pero sólo por su hook público.
    expect(fuente).toContain('useNavigationGuard')
  })
})
