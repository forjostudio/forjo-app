import { describe, it, expect } from 'vitest'
import { buildNavGroups } from '@/components/dashboard/nav-groups'
import type { Business } from '@/lib/types'

// ── Phase 02 / plan 02-04 — EL candado del reparto barra / Más (MOB-01 · MOB-03) ─────────────────
// Suite PURA: sin base, sin fixtures de datos y sin gate de entorno → cae sola en el carril
// paralelo `pure` (test/suite-split.ts clasifica por los IMPORTS del archivo).
//
// POR QUÉ ESTE ARCHIVO PUEDE EXISTIR: `buildNavGroups` es una función pura y su módulo NO declara
// la directiva de componente de cliente (el plan 02-01 la movió ahí justamente por esto). Vitest
// corre en `environment: 'node'` en este repo —no hay DOM, no hay Testing Library y el milestone
// prohíbe agregar paquetes— así que éste es el ÚNICO candado de vitest que la fase puede escribir:
// entra un negocio, sale un array, y el array se afirma sin montar un árbol de React.
//
// POR QUÉ IMPORTA MÁS QUE SU TAMAÑO: es el único punto del pipeline donde el GATEO POR RUBRO deja
// de ser invisible. El inventario de Más se deriva del menú del vertical, y si alguien lo
// reimplementa o lo filtra mal, el síntoma aparece en UN SOLO rubro — justo el que nadie prueba:
//   · restando por key en vez de por href, "Pacientes" queda duplicado y el rubro `salud` da 9
//     filas en vez de 8. Pasa en los otros tres rubros, pasa el build, pasa `tsc`, y pasa cualquier
//     UAT que no haya abierto una cuenta de salud;
//   · reimplementando el filtro, un negocio de `canchas` termina viendo "Equipo", una sección que su
//     rubro no tiene.
// Ni `tsc`, ni `npm run build`, ni la UAT visual ven ninguna de las dos. Esto sí.
//
// ⚠ SI ESTE CANDADO SE PONE ROJO, EL ARREGLO VA EN EL INVENTARIO, NUNCA ACÁ. No se baja el número
// esperado y no se borra el caso: el número es la medición, el rojo es el aviso.
//
// LA REGLA DE HONESTIDAD (heredada de la Phase 1): cada caso afirma PRIMERO que encontró algo. Un
// fixture mal armado —un `vertical` que no resuelve y cae al default— devolvería listas vacías y
// todos los conteos-cero pasarían solos. Un recorte vacío tiene que FALLAR, no pasar.

// ── Los cuatro hrefs que la barra inferior ya ocupa ──────────────────────────────────────────────
// Duplicación DELIBERADA y acotada a cuatro strings: tiene que coincidir con el `EN_LA_BARRA` de
// `app/(dashboard)/mas/mas-client.tsx`. No se importa a propósito — importarlo convertiría el
// candado en un espejo que siempre se da la razón: los conteos de rubro de abajo se medirían contra
// el mismo conjunto que cambió, y un quinto href bajaría las filas esperadas y las reales a la vez.
//
// ⚠ ESTA COPIA NO VIGILA AL COMPONENTE, Y ANTES DECÍA QUE SÍ. Un quinto href agregado SÓLO en el
// componente no rompe nada de acá (este archivo nunca lee el componente) y tampoco lo veía el
// barrido de fuente: Más perdía una fila con las dos suites en verde — medido. Quien ata las dos
// puntas es el caso "el conjunto restado es EXACTAMENTE los destinos de la barra menos /mas" de
// `test/panel-nav-chrome.test.ts`, que lee la declaración de la PRODUCCIÓN y la compara con los
// destinos que la barra renderiza. Lo de acá es la tabla de rubros; lo de allá, el vínculo.
//
// Y son CUATRO HREFS y no cinco keys por una razón estructural: las keys `clients` y `patients`
// apuntan al MISMO destino, así que restar por href deduplica por construcción y el bug de las
// cinco keys se vuelve imposible de escribir.
const EN_LA_BARRA = new Set(['/dashboard', '/appointments', '/agenda', '/clients'])

// ── La tabla de casos: los cuatro rubros, con sus números medidos ────────────────────────────────
// `total` = destinos que resuelve el inventario del rubro. `filasEnMas` = los que sobreviven a
// restar la barra. La diferencia es SIEMPRE 4 en los cuatro rubros, y eso también se afirma abajo.
const RUBROS: { vertical: string; total: number; filasEnMas: number }[] = [
  { vertical: 'salud', total: 12, filasEnMas: 8 },
  { vertical: 'belleza', total: 12, filasEnMas: 8 },
  { vertical: 'general', total: 12, filasEnMas: 8 },
  // `canchas` tiene un destino menos: su menú no trae 'equipo' (el rubro no tiene staff).
  { vertical: 'canchas', total: 11, filasEnMas: 7 },
]

/**
 * Fixture MÍNIMO a propósito: `buildNavGroups` sólo lee el rubro del negocio (columna `vertical`,
 * con fallback por `type`) para resolver su menú y su terminología. Todo lo demás de la fila es
 * irrelevante para el inventario, y ponerlo haría creer que influye.
 */
function negocio(vertical: string): Business {
  return { name: 'Negocio de prueba', vertical, type: null } as unknown as Business
}

/** El inventario del rubro, antes y después de restar la barra. */
function inventario(vertical: string) {
  const grupos = buildNavGroups(negocio(vertical))
  const items = grupos.flatMap(g => g.items)
  // El MISMO reparto que hace la pantalla Más: restar por href y volver a descartar los grupos que
  // quedaron sin items.
  const gruposEnMas = grupos
    .map(g => ({ section: g.section, items: g.items.filter(i => !EN_LA_BARRA.has(i.href)) }))
    .filter(g => g.items.length > 0)
  return { grupos, items, gruposEnMas, filas: gruposEnMas.flatMap(g => g.items) }
}

describe('el reparto barra / Más, rubro por rubro', () => {
  for (const caso of RUBROS) {
    it(`${caso.vertical}: ${caso.total} destinos en el inventario ⇒ ${caso.filasEnMas} filas en Más`, () => {
      const { grupos, items, filas } = inventario(caso.vertical)
      // Guarda de honestidad: sin esto, un fixture que no resuelve daría listas vacías y los
      // conteos de abajo pasarían por casualidad.
      expect(grupos.length).toBeGreaterThan(0)
      expect(items.length).toBeGreaterThan(0)
      expect(items).toHaveLength(caso.total)
      expect(filas).toHaveLength(caso.filasEnMas)
    })

    it(`${caso.vertical}: los 4 destinos de la barra existen en este rubro (sin excepciones)`, () => {
      // Si un rubro no expusiera uno de los cuatro, la barra tendría un destino muerto: un ítem que
      // navega a una sección que ese negocio no tiene. Se midió rubro por rubro y son 4 en los 4.
      const { items } = inventario(caso.vertical)
      expect(items.length).toBeGreaterThan(0)
      expect(items.filter(i => EN_LA_BARRA.has(i.href))).toHaveLength(4)
    })
  }
})

describe('el gateo por rubro FILTRA, no simplemente devuelve menos cosas', () => {
  it('canchas no expone Equipo, pero sí expone Canchas', () => {
    const { filas } = inventario('canchas')
    expect(filas.length).toBeGreaterThan(0)
    const labels = filas.map(i => i.label)
    // La mitad negativa: el rubro no tiene staff, así que la sección no le corresponde.
    expect(labels).not.toContain('Equipo')
    // La mitad positiva, y es la que convierte el caso en una prueba de que el filtro FILTRA: la
    // terminología de servicios en este rubro es "Canchas" y tiene que estar.
    expect(labels).toContain('Canchas')
  })

  it('salud habla en su propia terminología: Prestaciones y Consultorios', () => {
    const { filas } = inventario('salud')
    expect(filas.length).toBeGreaterThan(0)
    const labels = filas.map(i => i.label)
    expect(labels).toContain('Prestaciones')
    expect(labels).toContain('Consultorios')
  })

  it('belleza dice Locales y general dice Sucursales (el mismo destino, otra palabra)', () => {
    const deBelleza = inventario('belleza')
    const deGeneral = inventario('general')
    expect(deBelleza.filas.length).toBeGreaterThan(0)
    expect(deGeneral.filas.length).toBeGreaterThan(0)
    expect(deBelleza.filas.map(i => i.label)).toContain('Locales')
    expect(deGeneral.filas.map(i => i.label)).toContain('Sucursales')
  })
})

describe('la resta de la barra es por href, y es exacta', () => {
  for (const caso of RUBROS) {
    it(`${caso.vertical}: el complemento cierra — dentro de la barra + fuera == total`, () => {
      const { items, filas } = inventario(caso.vertical)
      expect(items.length).toBeGreaterThan(0)
      const dentro = items.filter(i => EN_LA_BARRA.has(i.href))
      const fuera = items.filter(i => !EN_LA_BARRA.has(i.href))
      expect(dentro.length + fuera.length).toBe(items.length)
      // Y lo que queda en Más es exactamente "lo de fuera": el segundo `.filter` de la pantalla
      // descarta grupos vacíos, nunca items.
      expect(filas).toHaveLength(fuera.length)
    })
  }

  it('salud: después de restar NO sobrevive ninguna fila Pacientes', () => {
    // ⚠ ÉSTE es el caso que caza el bug de las cinco keys, y sólo se puede cazar en `salud`.
    // El inventario tiene DOS keys al mismo destino (`clients` y `patients`). Si alguien restara
    // por key con "los cuatro destinos", la key `patients` no estaría en ese conjunto de cuatro, la
    // fila sobreviviría, y `salud` daría 9 filas con "Pacientes" duplicado — mientras los otros
    // tres rubros y todo el pipeline siguen verdes.
    const { filas } = inventario('salud')
    expect(filas.length).toBeGreaterThan(0)
    expect(filas.filter(i => i.label === 'Pacientes')).toHaveLength(0)
    // Y el destino entero desaparece, no sólo ese label: ninguna fila de Más apunta a la sección de
    // clientes, porque ya está en la barra.
    expect(filas.filter(i => EN_LA_BARRA.has(i.href))).toHaveLength(0)
  })
})

describe('ningún grupo vacío sobrevive al reparto', () => {
  for (const caso of RUBROS) {
    it(`${caso.vertical}: el grupo PANEL se queda sin un solo destino al restar la barra`, () => {
      const { grupos } = inventario(caso.vertical)
      // Antes de restar, el grupo del inicio del panel SÍ existe. Se afirma primero porque si no
      // existiera, todo lo de abajo pasaría por vacío y no probaría nada.
      const panel = grupos.find(g => g.section === 'PANEL')
      expect(panel).toBeDefined()
      expect(panel!.items.length).toBeGreaterThan(0)
      // ⚠ Lo que se afirma es el HECHO COMPUTABLE, no el efecto del filtro: TODOS los destinos de
      // ese grupo están en la barra, así que al restar le queda CERO. Afirmar "el grupo no aparece
      // en la lista final" sería medir el `.filter` de grupos vacíos del propio helper de este
      // archivo —se midió: una mutación que lo borre de la producción NO pone rojo esa forma— y un
      // candado que se da la razón a sí mismo es exactamente lo que la regla de honestidad prohíbe.
      // Que la pantalla Más de verdad descarte el grupo vacío lo fija el candado de cableado
      // (barrido estático del plan 02-04), que es el único que puede leerlo.
      expect(panel!.items.every(i => EN_LA_BARRA.has(i.href))).toBe(true)
      expect(panel!.items.filter(i => !EN_LA_BARRA.has(i.href))).toHaveLength(0)
    })

    it(`${caso.vertical}: el inventario nunca devuelve un grupo sin items`, () => {
      // El invariante que `buildNavGroups` posee: un grupo cuyas keys el rubro no expone no
      // renderiza ni su header. Con los cuatro rubros de hoy ninguno llega a quedar vacío, así que
      // este caso es un guardián del futuro (un rubro nuevo que no exponga ningún servicio), no una
      // medición de hoy — y se declara así para no hacerlo pasar por más de lo que es.
      const { grupos } = inventario(caso.vertical)
      expect(grupos.length).toBeGreaterThan(0)
      for (const g of grupos) expect(g.items.length).toBeGreaterThan(0)
    })
  }
})

describe('el conjunto de la barra tiene exactamente cuatro destinos', () => {
  it('cuatro valores, y son los cuatro que la barra renderiza', () => {
    // Si alguien sumara un quinto href acá "para que Más tenga menos filas", los conteos de la
    // tabla de rubros se rompen y el rojo aparece en el caso del rubro, no en éste. Este caso fija
    // el tamaño para que el rojo diga la causa.
    expect(EN_LA_BARRA.size).toBe(4)
    expect([...EN_LA_BARRA].sort()).toEqual(['/agenda', '/appointments', '/clients', '/dashboard'])
  })
})
