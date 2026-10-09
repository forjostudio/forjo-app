import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// ── Phase 02 / plan 02-04 — los invariantes INVISIBLES del chrome del panel ──────────────────────
// Suite PURA: sin base, sin fixtures y sin gate de entorno → cae sola en el carril paralelo `pure`
// (test/suite-split.ts clasifica por los IMPORTS del archivo).
//
// POR QUÉ ESTA SUITE LEE CÓDIGO FUENTE EN VEZ DE RENDERIZAR: el entorno de Vitest de este repo es
// `node` (vitest.config.mts) — no hay DOM, no hay Testing Library, no hay Playwright, y el milestone
// prohíbe agregar paquetes. Los tres componentes de esta fase llaman hooks de router en su cuerpo,
// así que no se pueden montar. Leer la fuente es la única herramienta que este repo tiene, y para
// estos invariantes alcanza porque todos son propiedades del CÓDIGO ESCRITO, no del render.
//
// QUÉ CUBRE QUE NINGÚN OTRO GATE PUEDE VER. Ninguno de los ocho invariantes de abajo lo ve `tsc`
// (son strings, no tipos), ni `npm run build` (Tailwind no avisa por una clase que no existe), ni la
// suite existente, ni la UAT visual —que no tiene con qué comparar—. Tres son especialmente
// traicioneros:
//   1. los cuatro valores del bloque de identidad: el markup que se reusa de desktop trae los VIEJOS
//      (36px, radio chico, 14px y 12px) y un ejecutor que obedezca la palabra "verbatim" entrega
//      ésos sin que nadie se entere;
//   2. la resta de la barra por href y no por key: el síntoma aparece SÓLO en el rubro `salud`;
//   3. el breakpoint `lg` y no el de 768px: a 375px y a 1280px se ve igual, el agujero está sólo
//      entre 768 y 1023px — la banda que hoy ya no tiene boton de menú.
//
// POR QUÉ ESTE ARCHIVO Y EL CANDADO DEL INVENTARIO SON DOS Y NO UNO: es la lección que la Phase 1
// pagó y dejó escrita. Un test de decisiones puras no puede ver si el componente las consume, y un
// barrido de fuente no puede computar un inventario. `test/panel-nav-groups.test.ts` fija QUÉ filas
// corresponden a cada rubro; esto fija que los componentes lo consuman así y respeten la forma.
//
// LA REGLA DE HONESTIDAD: cada barrido descuenta los comentarios ANTES de afirmar, y afirma PRIMERO
// que encontró algo. Un recorte vacío —porque la función se renombró o el archivo se movió— haría
// pasar todas sus aserciones de conteo-cero, y el candado creería estar mirando algo que no mira.
// Descontar comentarios no es cosmética: los cinco archivos vigilados están LLENOS de comentarios
// que nombran el breakpoint prohibido, las mutaciones crudas y los valores viejos, justamente para
// explicar por qué no se usan.
//
// ⚠ POR QUÉ ESTE ARCHIVO CONTIENE LITERALES QUE EN OTROS LADOS ESTÁN PROHIBIDOS: su trabajo es
// negarlos. Todos los barridos corren sobre `app/` y `components/`, NUNCA sobre `test/`, así que un
// literal que viva acá no puede auto-invalidar ningún gate.
//
// ⚠ SI UN INVARIANTE SE PONE ROJO, EL ARREGLO VA EN EL COMPONENTE, NO ACÁ. Y si el rojo es un
// recorte vacío, el arreglo es actualizar el marcador del recorte — nunca borrar el caso.

// ── Los tres helpers ────────────────────────────────────────────────────────────────────────────
// Copiados TAL CUAL de test/panel-history-sidebar.test.ts (que a su vez los tomó de
// test/panel-history-clients.test.ts, y ése de test/catalog-public.test.ts). No se reinventan: que
// el molde sea el mismo es lo que hace que un rojo de acá se lea igual que un rojo de allá.

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
 * POR QUÉ RECORTAR Y NO AFIRMAR SOBRE EL ARCHIVO: los archivos vigilados tienen cientos de líneas y
 * varios bloques que navegan. "En algún lado del archivo aparece `panelNavMode`" no prueba que el
 * link del menú lo use.
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

/**
 * Cuarto helper, propio de este archivo: recorta la región ENTRE dos marcadores.
 *
 * Hace falta porque dos de los ocho invariantes viven en regiones que `recorte` no puede delimitar:
 * el bloque de identidad de Más (su primera llave es la del ternario del logo, así que balancear
 * desde ahí se quedaría corto y dejaría afuera justo las dos líneas de texto que hay que medir) y
 * la etiqueta de apertura del elemento principal del layout (que no tiene ninguna llave).
 *
 * ⚠ Misma regla que `recorte`: devuelve string VACÍO si falta cualquiera de los dos marcadores o si
 * aparecen en orden invertido, y cada `it` lo afirma no vacío antes de seguir.
 */
function bloque(fuente: string, desde: string, hasta: string): string {
  const a = fuente.indexOf(desde)
  if (a === -1) return ''
  const b = fuente.indexOf(hasta, a + desde.length)
  if (b === -1) return ''
  return fuente.slice(a, b + hasta.length)
}

const cuenta = (src: string, patron: RegExp) => (src.match(patron) ?? []).length

// ── Los cinco archivos vigilados, con los comentarios ya descontados ────────────────────────────
const RUTA_BARRA = 'components/dashboard/panel-bottom-nav.tsx'
const RUTA_HEADER = 'components/dashboard/panel-top-bar.tsx'
const RUTA_MAS = 'app/(dashboard)/mas/mas-client.tsx'
const RUTA_MAS_PAGE = 'app/(dashboard)/mas/page.tsx'
const RUTA_SIDEBAR = 'components/dashboard/sidebar.tsx'
const RUTA_LAYOUT = 'app/(dashboard)/layout.tsx'

const barra = sinComentarios(read(RUTA_BARRA))
const header = sinComentarios(read(RUTA_HEADER))
const mas = sinComentarios(read(RUTA_MAS))
const masPage = sinComentarios(read(RUTA_MAS_PAGE))
const sidebar = sinComentarios(read(RUTA_SIDEBAR))
const layout = sinComentarios(read(RUTA_LAYOUT))

describe('1 · el breakpoint de la barra es lg, no el de 768px', () => {
  it('la barra se esconde en lg y NO en el breakpoint intermedio', () => {
    // Con un prefijo de 768px la banda 768-1023px se quedaría sin NINGÚN menú: no tiene sidebar
    // (que entra en 1024px) y ya no tiene botón de menú. El agujero no se ve ni a 375px ni a 1280px.
    expect(barra.length).toBeGreaterThan(0)
    expect(barra).toContain('lg:hidden')
    expect(cuenta(barra, /md:hidden/g)).toBe(0)
  })

  it('el header de mobile usa el MISMO breakpoint que la barra', () => {
    // Si los dos no coincidieran, habría una banda con header y sin barra (o al revés) y el alto
    // reservado del contenido quedaría mal justo ahí.
    expect(header.length).toBeGreaterThan(0)
    expect(header).toContain('lg:hidden')
    expect(cuenta(header, /md:hidden/g)).toBe(0)
  })

  it('el sidebar de desktop sigue siendo el simétrico exacto, y no se movió', () => {
    expect(sidebar).toContain('hidden lg:flex lg:flex-col lg:fixed')
  })
})

describe('2 · la resta de la barra en Más es por href y es de cuatro valores', () => {
  it('el conjunto restado es EXACTAMENTE los destinos de la barra menos /mas', () => {
    // POR QUÉ ESTE CASO SE ESCRIBE ASÍ Y NO CON LOS CUATRO STRINGS A MANO: la versión anterior sólo
    // exigía que los cuatro hrefs APARECIERAN en el archivo y que `'/clients'` apareciera una vez.
    // Con esas dos cuentas, un QUINTO href en `EN_LA_BARRA` ("para que Más tenga menos filas") pasa
    // en verde: los cuatro siguen apareciendo y el de clientes sigue siendo uno ⇒ Más pierde una
    // fila entera con el pipeline completo verde. Medido antes de reescribirlo.
    // La única aserción que muerde es la IGUALDAD de conjuntos contra la otra punta del contrato: lo
    // que Más resta tiene que ser, exactamente, lo que la barra renderiza sin su quinto destino
    // (`/mas`, que es la pantalla misma y no se resta de sí misma). Así el rojo aparece por los dos
    // lados: un href de más en `EN_LA_BARRA`, y un destino nuevo en la barra que nadie restó en Más.
    // Y NO se deduplica a propósito: un href escrito dos veces en la declaración tiene que dar rojo,
    // no colapsar en silencio.
    const declaracionMas = bloque(mas, 'const EN_LA_BARRA', '])')
    expect(declaracionMas).not.toBe('')
    const restados = (declaracionMas.match(/'\/[a-z-]+'/g) ?? []).sort()

    const declaracionBarra = bloque(barra, 'const DESTINOS', '\n]')
    expect(declaracionBarra).not.toBe('')
    const destinos = [...declaracionBarra.matchAll(/href: ('\/[a-z-]+')/g)].map(m => m[1])
    expect(destinos.length).toBeGreaterThan(1)
    expect(destinos).toContain("'/mas'")

    expect(restados).toEqual(destinos.filter(h => h !== "'/mas'").sort())
    expect(restados).toHaveLength(destinos.length - 1)
  })

  it('el href de clientes aparece UNA sola vez en toda la pantalla', () => {
    // Dos ocurrencias significarían que se enumeraron las dos keys que apuntan al mismo destino, y
    // ahí vuelve el bug: 9 filas con "Pacientes" duplicado, y SOLAMENTE en el rubro `salud`.
    expect(mas.length).toBeGreaterThan(0)
    expect(cuenta(mas, /'\/clients'/g)).toBe(1)
  })

  it('Más NO reimplementa el filtro por rubro: lo deriva del inventario', () => {
    // Dos copias del filtro divergen en silencio y el síntoma sale en un solo rubro. El gateo se
    // preserva por construcción o no se preserva.
    expect(mas).toContain('buildNavGroups')
    expect(cuenta(mas, /resolveVertical/g)).toBe(0)
  })

  it('el reparto resta por href y VUELVE a descartar los grupos que quedaron vacíos', () => {
    // ⚠ Éste es el hermano de cableado de un caso que el candado puro del inventario NO puede ver:
    // allá el helper del test aplica su propio descarte, así que una mutación que borre este
    // `.filter` de la producción no lo pone rojo (se midió). Acá sí. Sin él, el grupo del inicio del
    // panel —cuyo único destino está en la barra— renderizaría su header sin una sola fila debajo.
    // ⚠ Se delimita con `bloque` y NO con `recorte`: la primera llave después del marcador es la
    // del objeto que devuelve el `.map`, así que balancear desde ahí corta la cadena justo antes
    // del `.filter` que este caso tiene que leer. Se midió: daba un rojo cuyo arreglo tentador era
    // borrar la aserción, con el código de producción perfectamente correcto.
    const reparto = bloque(mas, 'const grupos =', 'return (')
    expect(reparto).not.toBe('')
    expect(reparto).toContain('buildNavGroups')
    expect(reparto).toContain('EN_LA_BARRA.has')
    expect(reparto).toMatch(/\.filter\(g => g\.items\.length > 0\)/)
    // Y el descarte va DESPUÉS de restar: antes no haría nada, porque ningún grupo está vacío todavía.
    expect(reparto.indexOf('EN_LA_BARRA.has')).toBeLessThan(reparto.indexOf('.filter(g => g.items.length > 0)'))
  })
})

describe('3 · el orden del guard y del consumo es contrato, en los tres componentes que navegan', () => {
  // No es un detalle de orden: si el consumo corriera antes, el retroceso ya habría salido de la
  // subsección cuando el diálogo pregunta "¿salir sin guardar?", y cancelar dejaría al dueño en otro
  // lado del que estaba.
  const casos: { nombre: string; fuente: string; marcador: string }[] = [
    { nombre: 'la barra inferior', fuente: barra, marcador: 'DESTINOS.map(destino =>' },
    { nombre: 'la pantalla Más', fuente: mas, marcador: 'group.items.map(item =>' },
    { nombre: 'el sidebar de desktop', fuente: sidebar, marcador: 'group.items.map(item =>' },
  ]

  for (const caso of casos) {
    it(`${caso.nombre}: el guard de cambios sin guardar se evalúa PRIMERO`, () => {
      // Recortar es obligatorio: Más y el sidebar tienen varios bloques que navegan, y "en algún
      // lado del archivo aparece la política" no prueba que el link del menú la use.
      const fila = recorte(caso.fuente, caso.marcador)
      expect(fila).not.toBe('')
      const nav = recorte(fila, 'onNavigate=')
      expect(nav).not.toBe('')
      expect(nav).toContain('requestNavigation')
      expect(nav).toContain('consumeOwnedPanelEntry')
      expect(nav.indexOf('requestNavigation')).toBeLessThan(nav.indexOf('consumeOwnedPanelEntry'))
    })

    it(`${caso.nombre}: el consumo PREVIENE la navegación en vez de encadenarla`, () => {
      // El retroceso del navegador es ASÍNCRONO: si se dejara navegar, el router empujaría su
      // entrada antes de que el browser procese el pop y la subsección volvería a quedar enterrada.
      const nav = recorte(recorte(caso.fuente, caso.marcador), 'onNavigate=')
      expect(nav).not.toBe('')
      expect(nav).toMatch(/consumeOwnedPanelEntry\(\)\)\s*e\.preventDefault\(\)/)
      expect(nav).not.toContain('await consumeOwnedPanelEntry')
      expect(nav).not.toContain('consumeOwnedPanelEntry().then')
    })

    it(`${caso.nombre}: declara su modo de historial con la ruta actual y el destino`, () => {
      const fila = recorte(caso.fuente, caso.marcador)
      expect(fila).not.toBe('')
      expect(fila).toContain('replace={panelNavMode(')
      expect(fila).toContain('from: pathname')
    })
  }
})

describe('4 · cero mutaciones crudas de historial en los tres componentes nuevos', () => {
  // Son tres módulos los que ya escriben en la pila y conviven sólo porque cada uno re-verifica su
  // propia marca antes de retroceder. Un cuarto escritor sin esa disciplina saca al dueño del panel
  // con un gesto que él cree inofensivo.
  const nuevos: { ruta: string; fuente: string; navega: boolean }[] = [
    { ruta: RUTA_BARRA, fuente: barra, navega: true },
    { ruta: RUTA_HEADER, fuente: header, navega: false },
    { ruta: RUTA_MAS, fuente: mas, navega: true },
  ]

  for (const archivo of nuevos) {
    it(`${archivo.ruta}: ninguna escritura directa en la pila del navegador`, () => {
      // La guarda de honestidad: sin ella, un archivo vacío o movido pasaría este caso solo.
      expect(archivo.fuente.length).toBeGreaterThan(500)
      expect(cuenta(archivo.fuente, /pushState|replaceState|history\.back|history\.forward|history\.go/g)).toBe(0)
    })

    it(`${archivo.ruta}: ${archivo.navega ? 'consume los helpers del módulo único' : 'no navega, así que no consume nada'}`, () => {
      const consumos = cuenta(archivo.fuente, /consumeOwnedPanelEntry|panelNavMode/g)
      if (archivo.navega) {
        expect(consumos).toBeGreaterThan(0)
        expect(archivo.fuente).toContain("from '@/lib/panel-history'")
      } else {
        // El header es chrome de lectura: no tiene un solo destino, así que tampoco tiene política.
        expect(consumos).toBe(0)
      }
    })
  }
})

describe('5 · los cuatro valores del bloque de identidad de Más', () => {
  // EL INVARIANTE MÁS INVISIBLE DE LA FASE. El markup de origen (el header del sidebar) trae 36px,
  // radio chico, 14px y 12px; el contrato de esta pantalla pide 40px, radio grande, 16px y 14px
  // porque acá el bloque es el elemento dominante y allá es chrome. Nada más en todo el pipeline
  // distingue una cosa de la otra.
  const identidad = bloque(mas, 'bg-card border border-border rounded-lg p-4', 'aria-label="Secciones"')

  it('la región del bloque de identidad existe (si no, todo lo de abajo pasaría por vacío)', () => {
    expect(identidad).not.toBe('')
    expect(identidad.length).toBeGreaterThan(300)
  })

  it('el avatar mide 40 y no 36, y lleva el radio grande en los DOS caminos', () => {
    // Los dos caminos son el logo cargado y el fallback con la inicial: si sólo uno de los dos se
    // actualizara, la pantalla cambiaría de forma según el negocio tenga logo o no.
    expect(identidad).not.toBe('')
    expect(cuenta(identidad, /w-10 h-10/g)).toBe(2)
    expect(cuenta(identidad, /w-9 h-9/g)).toBe(0)
    expect(cuenta(identidad, /rounded-lg/g)).toBeGreaterThanOrEqual(2)
    expect(cuenta(identidad, /rounded-md/g)).toBe(0)
  })

  it('el nombre va a 16px y la línea de plan a 14px', () => {
    // ⚠ Las dos negaciones se afirman POR REGIÓN y nunca sobre el archivo entero: el tamaño chico
    // existe legítimamente en la firma del pie, que se copia verbatim del sidebar, así que una
    // negación global sería insatisfacible.
    expect(identidad).not.toBe('')
    expect(identidad).toContain('text-base')
    expect(identidad).toContain('text-sm')
    expect(cuenta(identidad, /text-xs/g)).toBe(0)
  })

  it('el fallback CONSERVA el acento de marca y la fuente de títulos', () => {
    // Es el único uso del acento de toda la superficie y tiene que verse idéntico al de desktop.
    expect(identidad).not.toBe('')
    expect(identidad).toContain('bg-primary')
    expect(identidad).toContain('var(--font-heading)')
  })
})

describe('6 · la jerarquía de encabezados y los nombres de los landmarks', () => {
  it('Más tiene UN encabezado de nivel 1, está oculto, y no hay salto de nivel', () => {
    // El header fijo ya nombra la pantalla EN PANTALLA: un título visible sería el mismo texto dos
    // veces a 56px de distancia. Pero la jerarquía necesita su nivel 1 igual.
    const fuentes = mas + masPage
    expect(fuentes.length).toBeGreaterThan(0)
    expect(cuenta(fuentes, /<h1/g)).toBe(1)
    const linea = fuentes.split('\n').find(l => l.includes('<h1')) ?? ''
    expect(linea).not.toBe('')
    expect(linea).toContain('sr-only')
    expect(cuenta(fuentes, /<h2/g)).toBe(0)
    expect(cuenta(fuentes, /<h3/g)).toBe(0)
  })

  it('los dos landmarks de navegación tienen nombres DISTINTOS', () => {
    // Estando en Más coexisten la barra y la lista. Con el mismo nombre el lector de pantalla
    // anuncia "navegación" dos veces y no se sabe cuál es cuál.
    expect(mas).toContain('aria-label="Secciones"')
    expect(barra).toContain('aria-label="Navegación principal"')
    expect(cuenta(mas, /aria-label="Navegación principal"/g)).toBe(0)
  })

  it('cada aria-labelledby de la pantalla tiene su id escrito, el derivado incluido', () => {
    // Un vínculo roto no tira error de consola, no rompe el build y no se ve en la UAT visual: deja
    // el grupo sin nombre, en silencio.
    //
    // POR QUÉ NO ALCANZA CONTAR OCURRENCIAS, que es como estaba escrito antes: la cota era "el
    // prefijo `mas-grupo-` aparece al menos 2 veces". Borrando el `id` del `<p>` DERIVADO —o sea
    // dejando los CUATRO grupos del menú sin nombre accesible— quedaban 3 apariciones (la
    // referencia del `.map` más el par completo de CUENTA) y el caso pasaba en verde: el par
    // hardcodeado satisfacía la cota solo, y el extremo derivado quedaba sin vigilar. Medido.
    //
    // La forma que muerde es la IGUALDAD, no la cota: cada referencia tiene que encontrar su
    // identificador escrito, y cada grupo tiene que tener su referencia. Se compara la EXPRESIÓN
    // literal de los dos extremos (con los espacios colapsados), que es justo lo que el contrato
    // pide escribir inline en los dos lados.
    const expresion = (s: string) => s.replace(/\s+/g, '')
    const atributo = /(\{`[^`]*`\}|"[^"]*")/
    const refs = [...mas.matchAll(new RegExp(`aria-labelledby=${atributo.source}`, 'g'))].map(m => expresion(m[1]))
    const ids = [...mas.matchAll(new RegExp(`\\bid=${atributo.source}`, 'g'))].map(m => expresion(m[1]))

    // ⚠ REVISIÓN DE LA UAT (2026-10-09): el grupo `CUENTA` dejó de existir como tal. "Ver mi
    // página" subió junto a AJUSTES y el par Ayuda/Cerrar sesión quedó detrás de una divisoria,
    // espejando el sidebar de desktop. Ese par conserva nombre accesible, pero por `aria-label`
    // (no tiene eyebrow visible que lo nombre), así que la aserción pasa de "dos expresiones
    // `aria-labelledby` distintas" a la forma MÁS FUERTE: **ningún `role="group"` sin nombre**,
    // sea cual sea el mecanismo. Así el caso sigue mordiendo si alguien borra el `id` derivado Y
    // además cubre el grupo nuevo, que antes no existía.
    // ⚠ El `aria-label` se cuenta ANCLADO a su `role="group"`, no suelto: los dos landmarks
    // `<nav>` de la pantalla también llevan `aria-label` y lo inflarían (medido: daba 3 contra 2
    // grupos). Acá el atributo del nombre va siempre pegado al `role`, que es como lo escribe el
    // contrato en los dos casos.
    const porLabel = cuenta(mas, /role="group" aria-label="/g)
    const grupos = cuenta(mas, /role="group"/g)

    // Guardas de honestidad, DOS: que haya grupos, y que los dos mecanismos de nombrado estén
    // presentes. Sin la segunda, pasar todos los grupos a `aria-label` dejaría el extremo derivado
    // —el que vigila los cuatro grupos del menú— sin nadie mirándolo.
    expect(grupos).toBeGreaterThan(0)
    expect(refs.length).toBeGreaterThan(0)
    expect(porLabel).toBeGreaterThan(0)

    // Ningún grupo sin nombre: cada `role="group"` aporta su `aria-labelledby` o su `aria-label`.
    expect(refs.length + porLabel).toBe(grupos)
    // Y ninguna referencia sin su identificador escrito.
    for (const ref of refs) expect(ids).toContain(ref)
  })

  it('el header fijo NO lleva encabezados: sus dos líneas son párrafos', () => {
    // Las 13 pantallas conservan el suyo. Un encabezado en el chrome fijo rompería la jerarquía de
    // todas a la vez y las dejaría con dos títulos de nivel 1.
    expect(header.length).toBeGreaterThan(0)
    expect(cuenta(header, /<h1/g)).toBe(0)
    expect(cuenta(header, /<h2/g)).toBe(0)
    expect(cuenta(header, /<h3/g)).toBe(0)
    expect(cuenta(header, /<p/g)).toBeGreaterThanOrEqual(2)
  })
})

describe('7 · un solo menú en mobile', () => {
  it('el sidebar ya no tiene estado de drawer, ni botón, ni overlay, ni capas de modal', () => {
    // ⚠ Se descuentan comentarios ANTES de contar, a propósito: un drawer COMENTADO "para después"
    // es un inventario muerto que el próximo que agregue una sección va a actualizar a medias.
    expect(sidebar.length).toBeGreaterThan(1000)
    expect(cuenta(sidebar, /mobileOpen/g)).toBe(0)
    expect(cuenta(sidebar, /\bMenu\b/g)).toBe(0)
    expect(cuenta(sidebar, /bg-black\/60/g)).toBe(0)
    expect(cuenta(sidebar, /z-40/g)).toBe(0)
    expect(cuenta(sidebar, /z-50/g)).toBe(0)
    expect(cuenta(sidebar, /translate-x-/g)).toBe(0)
  })

  it('tampoco sobrevive COMENTADO: el barrido se repite sobre la fuente cruda', () => {
    // La otra mitad del caso de arriba, y la que ése no puede ver: con los comentarios descontados,
    // un drawer entero comentado "para después" es INVISIBLE. Y un inventario muerto es peor que
    // ninguno — el próximo que agregue una sección lo va a actualizar a medias, o lo va a
    // descomentar creyendo que sigue cableado. Esta pasada corre sobre el archivo SIN descontar
    // nada, y hoy pasa limpia porque el plan 02-03 borró el drawer en vez de comentarlo.
    const crudo = read(RUTA_SIDEBAR)
    expect(crudo.length).toBeGreaterThan(1000)
    for (const resto of [/mobileOpen/g, /bg-black\/60/g, /z-40/g, /z-50/g, /translate-x-/g]) {
      expect(cuenta(crudo, resto)).toBe(0)
    }
  })

  it('el sidebar sigue siendo el sidebar: el bloque de desktop está intacto', () => {
    // La mitad positiva del caso de arriba. Sin ella, un sidebar BORRADO entero pasaría el conteo-cero.
    expect(sidebar).toContain('hidden lg:flex lg:flex-col lg:fixed')
    expect(sidebar).toContain('buildNavGroups')
    expect(cuenta(sidebar, /<Link/g)).toBeGreaterThan(0)
  })
})

// ── Quinto y sexto helper: el barrido de TODO el route group ────────────────────────────────────
// Los cuatro helpers de arriba miran archivos nombrados. Este par mira el route group COMPLETO,
// porque el modo de falla que cierra (una pantalla que estrena su propia barra de acciones pegada
// al borde inferior) puede aparecer en cualquiera de las 15 pantallas, incluidas las que todavía no
// existen. Recorre `app/(dashboard)` entero en vez de una lista: una lista habría que mantenerla, y
// la próxima pantalla llegaría sin entrada.

/** Todos los `.tsx` bajo `rel`, recursivo. Puro: sólo `readdirSync`, sin reloj, sin base. */
function tsxDe(rel: string): string[] {
  const salida: string[] = []
  for (const entrada of readdirSync(join(process.cwd(), rel), { withFileTypes: true })) {
    const hijo = `${rel}/${entrada.name}`
    if (entrada.isDirectory()) salida.push(...tsxDe(hijo))
    else if (entrada.name.endsWith('.tsx')) salida.push(hijo)
  }
  return salida
}

/**
 * Las cadenas de clases candidatas de un archivo: cada literal de string (comillas simples, dobles
 * o template) de la fuente ya sin comentarios. Se tokeniza por espacios, que es exactamente como
 * las lee Tailwind.
 */
function literales(src: string): string[] {
  return src.match(/(['"`])(?:\\.|(?!\1)[\s\S])*\1/g) ?? []
}

/**
 * Igual que `literales`, pero con el índice de cada literal dentro de la fuente. Hace falta para
 * poder mirar a qué etiqueta JSX está pegada la cadena de clases: el mismo valor arbitrario es
 * legítimo o no según si el elemento vive en el flujo del documento o en un portal por encima de la
 * barra. Sin `matchAll` a propósito (el `target` del repo es ES2017).
 */
function literalesConPosicion(src: string): { texto: string; indice: number }[] {
  const salida: { texto: string; indice: number }[] = []
  const re = /(['"`])(?:\\.|(?!\1)[\s\S])*\1/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) salida.push({ texto: m[0], indice: m.index })
  return salida
}

/** El nombre de la última etiqueta JSX abierta antes de `indice` (`''` si no hay ninguna). */
function etiquetaAnterior(src: string, indice: number): string {
  const abiertas = src.slice(0, indice).match(/<[A-Za-z][A-Za-z0-9_.]*/g)
  return abiertas ? abiertas[abiertas.length - 1].slice(1) : ''
}

describe('8 · el alto reservado para el chrome fijo es coherente', () => {
  const principal = bloque(layout, '<main', '>')

  it('la etiqueta del elemento principal existe (si no, lo de abajo pasaría por vacío)', () => {
    expect(principal).not.toBe('')
    expect(principal).toContain('className')
  })

  it('reserva el alto del header arriba y el de la barra abajo, y los suelta en desktop', () => {
    // La reserva se hace en UN SOLO lugar para que ninguna de las 13 pantallas agregue padding
    // propio. Los dos `lg:` a cero son obligatorios: a ≥1024px no hay chrome de mobile y reservar
    // ahí dejaría un hueco arriba y otro abajo.
    expect(principal).not.toBe('')
    expect(principal).toContain('pt-14')
    expect(principal).toContain('lg:pt-0')
    expect(principal).toContain('var(--panel-nav-h)')
    expect(principal).toContain('env(safe-area-inset-bottom,0px)')
    expect(principal).toContain('lg:pb-0')
  })

  it('ningún valor arbitrario de los tres archivos del chrome lleva un espacio', () => {
    // EL MODO DE FALLA SILENCIOSO: con un espacio adentro la clase no se genera, Tailwind no avisa,
    // el compilador no lo ve, el build pasa, y el padding simplemente no existe ⇒ la barra tapa el
    // último elemento de cada pantalla.
    const arbitrarios = /\[[^[\]]*(?:calc|env|var)\([^[\]]*\]/g
    let total = 0
    for (const fuente of [layout, barra, header]) {
      const hallados = fuente.match(arbitrarios) ?? []
      total += hallados.length
      for (const valor of hallados) expect(valor).not.toContain(' ')
    }
    // Guarda de honestidad: si el recorte no encontró ninguno, el caso no midió nada.
    expect(total).toBeGreaterThan(0)
  })

  it('ninguna pantalla del panel ancla algo al borde inferior sin descontar el alto de la barra', () => {
    // EL MODO DE FALLA QUE ESTE CASO CIERRA, y que el `pb` del `<main>` NO puede cerrar: un elemento
    // `sticky bottom-0` / `fixed bottom-0` se fija al borde del SCROLLPORT, no al del `<main>`, así
    // que el padding inferior del layout está POR DEBAJO suyo y no lo empuja. La barra es
    // `fixed bottom-0`, `z-30` y `bg-card` OPACO ⇒ le tapa la banda inferior entera. Le pasó a la
    // fila de Guardar/Publicar del editor de `/web`, que es hoy la única barra de acciones pegada
    // del panel; la próxima pantalla que estrene una tiene que descontar el alto o ponerse roja acá.
    //
    // LA REGLA: dentro de una cadena de clases que posiciona con `sticky` o `fixed`, todo
    // `bottom-*` SIN prefijo de breakpoint tiene que referenciar `var(--panel-nav-h)`. Los
    // prefijados (`lg:bottom-0`) quedan exentos a propósito: a ≥1024px no hay chrome de mobile y
    // descontarlo ahí dejaría un hueco. Y `absolute bottom-0` queda afuera por construcción: se
    // ancla a su contenedor `relative`, no al viewport (las tres barritas de color de las tarjetas
    // de Finanzas son exactamente ese caso, y son legítimas).
    const archivos = tsxDe('app/(dashboard)')
    expect(archivos.length).toBeGreaterThan(10)

    let anclados = 0
    for (const archivo of archivos) {
      for (const literal of literales(sinComentarios(read(archivo)))) {
        const tokens = literal.slice(1, -1).split(/\s+/)
        const posiciona = tokens.some(t => /(?:^|:)(?:sticky|fixed)$/.test(t))
        if (!posiciona) continue
        for (const token of tokens.filter(t => t.startsWith('bottom-'))) {
          anclados++
          expect(token, `${archivo}: ${token} no descuenta el alto de la barra`).toContain('var(--panel-nav-h)')
        }
      }
    }
    // Guarda de honestidad: si el barrido no encontró ni un solo elemento anclado abajo, el caso no
    // midió nada (archivo movido, regex roto) y pasaría por vacío.
    expect(anclados).toBeGreaterThan(0)
  })

  it('ninguna pantalla del panel fija su alto al viewport en mobile', () => {
    // EL OTRO MODO DE FALLA, EL QUE EL CASO DE ARRIBA NO PODÍA VER: acá no hay ANCLAJE al borde
    // inferior, hay un ALTO calculado contra el viewport. Una pantalla que hace
    // `h-[calc(100vh-56px)] overflow-hidden` con scrollers internos NO fluye con el documento, así
    // que el `pb` del `<main>` le queda POR DEBAJO y no la empuja: su último renglón nace tapado por
    // la barra y sólo se alcanza encadenando el scroll al documento, que es exactamente el doble
    // scroll torpe que el criterio 3 existe para evitar. Les pasó a `/clients` (uno de los cinco
    // destinos de la barra, y la pantalla de uso diario) y a `/clinical-history`, y se escapó de los
    // 17 hallazgos del code review, del caso de arriba (que barre `sticky|fixed bottom-*`) y del
    // guion de UAT.
    //
    // ⚠ LA REGLA CAMBIÓ, Y ES MÁS DURA QUE LA ANTERIOR. La primera versión pedía que esos altos
    // DESCONTARAN `var(--panel-nav-h)`. Eso convirtió el alto en una cuenta de constantes que se
    // rompió DOS veces: la primera por no restar la barra, la segunda porque los tres banners del
    // `<main>` entran EN FLUJO antes del contenido y la cuenta no los veía. Un candado que exige
    // enumerar el chrome bendice la forma frágil: cada chrome nuevo la vuelve a romper en silencio y
    // el candado sigue verde. Así que ahora la regla es que en mobile NO SE NOMBRA el viewport:
    //
    //   bajo `app/(dashboard)`, todo `h-` o `max-h-` atado al viewport (valor arbitrario con
    //   `100vh`/`100dvh`/`100svh`, o las palabras `h-screen`/`h-dvh`/`h-svh`/`h-lvh`) tiene que
    //   venir prefijado por una variante de DESKTOP. El alto disponible en mobile lo da el contrato
    //   del layout (`<main>` en `flex flex-col` + envoltorio `relative grow` + pantalla en
    //   `absolute inset-0`), que lo DERIVA del espacio que de verdad quedó.
    //
    // Tres exenciones, las tres con un hecho medido detrás y ninguna por comodidad:
    //   · variante `lg:` / `xl:` / `2xl:` ⇒ la clase sólo aplica a ≥1024px, donde no hay chrome de
    //     mobile (es el caso de la columna del editor de `/web`, `lg:max-h-[calc(100vh-8rem)]`, y de
    //     la mitad de desktop de las dos pantallas bloqueadas, `lg:h-screen`). `sm:` y `md:` NO
    //     eximen: a 768px la barra SÍ está, porque entra por `lg:hidden` y no por `md:hidden`
    //     (M-5, y es el caso 1 de este mismo archivo).
    //   · primitivas de overlay (`Dialog*`, `Sheet*`, `Drawer*`, `Popover*`, …) ⇒ montan en un
    //     portal con `fixed … z-50` (`components/ui/dialog.tsx:102`) y la barra es `z-30`
    //     (`panel-bottom-nav.tsx:90`): el overlay va ENCIMA de la barra, no debajo, así que
    //     descontarla le encogería el alto sin motivo y le rompería el centrado (es el caso del
    //     diálogo de servicio de `/settings`, `max-h-[calc(100svh-2rem)]`).
    //   · `min-h-*` queda FUERA del barrido: es un piso, no un techo. Un mínimo no puede esconder
    //     contenido bajo la barra —el elemento crece con su contenido y el `pb` del `<main>` lo
    //     empuja— y es la forma que usa el propio contrato (`min-h-dvh`) y el upsell de `/web`
    //     (`min-h-[70vh]`).
    const SOLO_DESKTOP = /^(?:lg|xl|2xl)$/
    const OVERLAY = /Dialog|Sheet|Drawer|Popover|Tooltip|Command|Modal/
    const ALTO_DE_VIEWPORT = /^((?:[a-z0-9@._-]+:)*)(?:max-)?h-(?:\[[^\]]*100[dsl]?vh[^\]]*\]|screen|dvh|svh|lvh)$/

    const archivos = tsxDe('app/(dashboard)')
    expect(archivos.length).toBeGreaterThan(10)

    let hallados = 0
    let exigidos = 0
    for (const archivo of archivos) {
      const fuente = sinComentarios(read(archivo))
      for (const { texto, indice } of literalesConPosicion(fuente)) {
        for (const token of texto.slice(1, -1).split(/\s+/)) {
          const m = token.match(ALTO_DE_VIEWPORT)
          if (!m) continue
          hallados++
          if (OVERLAY.test(etiquetaAnterior(fuente, indice))) continue
          exigidos++
          expect(
            m[1].split(':').filter(Boolean).some(v => SOLO_DESKTOP.test(v)),
            `${archivo}: ${token} ata el alto al viewport en mobile. El alto disponible lo da el `
            + 'contrato del layout (flex flex-col + relative grow + absolute inset-0), no un calc '
            + 'que enumere el chrome: esa cuenta ya se rompió dos veces en esta fase',
          ).toBe(true)
        }
      }
    }
    // DOS guardas de honestidad, no una: que el barrido haya encontrado alturas de viewport, y que
    // al menos una haya quedado EXIGIDA. Sin la segunda, una exención que se ensanchara de más
    // (p. ej. `OVERLAY` cazando `div`) dejaría el caso pasando por vacío sin medir nada.
    expect(hallados).toBeGreaterThan(0)
    expect(exigidos).toBeGreaterThan(0)
  })

  it('el contrato del alto disponible sigue cableado en los dos extremos', () => {
    // LA CONTRACARA DEL CASO DE ARRIBA. Ése PROHÍBE la forma frágil; éste exige que la buena siga
    // en su lugar. Sin este caso, borrar `grow` del envoltorio dejaría a las dos pantallas
    // bloqueadas con el alto de su contenido (medido: 2017px en vez de 453) y el barrido de arriba
    // seguiría verde, porque ya no habría ningún alto de viewport que señalar.
    //
    // Las tres piezas del contrato, y por qué cada una:
    //   · `<main>` en `flex flex-col` ⇒ es lo que permite repartir el sobrante.
    //   · envoltorio `relative grow` ⇒ `grow` se queda con el sobrante DESPUÉS de los banners en
    //     flujo (que es el residuo que este contrato cierra), y `relative` lo vuelve el bloque
    //     contenedor del `absolute inset-0`. `grow` y no `flex-1`: `flex-1` pone `flex-basis: 0` y
    //     el contenido de las 12 pantallas que fluyen dejaría de contar para el alto intrínseco del
    //     `<main>`, o sea que la reserva del `pb` pasaría a depender de un detalle del navegador.
    //   · `min-h-dvh` y no `min-h-screen` ⇒ `100vh` es el viewport GRANDE (barra de URL escondida)
    //     y la barra es `fixed` sobre el VISIBLE. Medido con el viewport visible en 667 y la unidad
    //     resolviendo a 727: `vh` da 60px de solape, `dvh` da 0.
    expect(principal).not.toBe('')
    expect(principal, 'el <main> perdió `flex flex-col`: sin él el envoltorio no recibe el sobrante').toContain('flex flex-col')
    expect(principal, 'el <main> volvió a `vh`: con la barra de URL visible el borde cae 60px por debajo de la barra').toContain('min-h-dvh')
    expect(principal).not.toContain('min-h-screen')

    const envoltorio = bloque(layout, '<div className="relative grow', '>')
    expect(envoltorio, 'el envoltorio del contenido perdió `relative grow` (o le cambiaron el orden de las clases)').not.toBe('')
    expect(envoltorio, 'el envoltorio perdió el padding de contenido de las 15 pantallas').toContain('p-4')

    // La otra punta, SIN lista de archivos (una lista habría que mantenerla y la próxima pantalla
    // de la familia llegaría sin entrada): toda pantalla que fije su alto a la pantalla en desktop
    // con `lg:h-screen` es, por construcción, de la familia bloqueada ⇒ en mobile no tiene alto
    // propio y tiene que montarse con `absolute inset-0`, más el `lg:static` que la devuelve al
    // flujo en desktop.
    let bloqueadas = 0
    for (const archivo of tsxDe('app/(dashboard)')) {
      for (const literal of literales(sinComentarios(read(archivo)))) {
        const tokens = literal.slice(1, -1).split(/\s+/)
        if (!tokens.includes('lg:h-screen')) continue
        bloqueadas++
        for (const exigido of ['absolute', 'inset-0', 'lg:static']) {
          expect(
            tokens,
            `${archivo}: fija el alto a la pantalla en desktop pero en mobile le falta \`${exigido}\``,
          ).toContain(exigido)
        }
      }
    }
    // Guarda de honestidad: si el barrido no encontrara ninguna pantalla de la familia (archivo
    // movido, clase renombrada), el caso pasaría por vacío sin medir nada.
    expect(bloqueadas).toBeGreaterThan(0)
  })
})

describe('9 · los tres módulos de historial no se tocan desde el chrome nuevo', () => {
  it('ninguno de los tres componentes nuevos importa los otros dos módulos de pila', () => {
    // Criterio 6 de la fase: el mecanismo que el dueño ya verificó sigue siendo exactamente el
    // mismo. El guard de cambios sin guardar SÍ se usa, pero sólo por su hook público.
    for (const fuente of [barra, header, mas]) {
      expect(fuente).not.toContain('@/lib/overlay-history')
      expect(fuente).not.toContain('@/lib/dirty-history')
    }
    expect(barra).toContain('useNavigationGuard')
    expect(mas).toContain('useNavigationGuard')
  })
})

// ── Décimo bloque: los dos controles que eran gate de plan y no candado ────────────────────────
// Los dos casos de abajo cubren amenazas `high` del registro de la fase (T-02-13 y T-02-15) cuya
// mitigación se verificó UNA sola vez, con un gate en bash dentro del plan, y después no dejó nada
// que la sostuviera. La auditoría de seguridad lo midió sobre el estado correcto en disco: romper
// cualquiera de las dos dejaba el pipeline ENTERO en verde. Un control que sólo corrió el día que
// se escribió no es un control, es una foto.
describe('10 · los controles de durabilidad que antes eran gate de plan', () => {
  it('el layout monta los TRES hermanos del chrome, no dos', () => {
    // T-02-13 (high, Denial of Service de acceso): desmontar `<PanelTopBar>` deja mobile sin header
    // y `<PanelBottomNav>` lo deja sin menú — y como el drawer hamburguesa ya no existe (bloque 7),
    // en los dos casos el dueño se queda SIN forma de navegar el panel desde el teléfono.
    // Medido antes de escribir este caso: comentar `<PanelTopBar />` dejaba 65/65 tests en verde.
    // Funciona contra el comentado además del borrado porque `sinComentarios` barre los `{/* */}`
    // de JSX antes de buscar, igual que el bloque 7 con el drawer.
    for (const hermano of ['<Sidebar', '<PanelBottomNav', '<PanelTopBar']) {
      expect(layout, `el layout del panel dejó de montar ${hermano}`).toContain(hermano)
    }
  })

  it('el sidebar de desktop sigue señalando la ruta activa de forma accesible', () => {
    // T-02-15 (high, Tampering): `aria-current` es la mitad ACCESIBLE del señalado del menú de
    // desktop; la otra mitad es color, que un lector de pantalla no ve. Era un conteo del gate de
    // plan de 02-03 Task 2, no un candado: borrarlo dejaba 131/131 en verde sobre cuatro suites.
    // Va acá y no en el bloque 7 porque no es "el sidebar sigue existiendo" sino "sigue haciendo
    // lo que el borrado del drawer podría haberse llevado puesto".
    expect(cuenta(sidebar, /aria-current/g), 'el sidebar perdió su `aria-current`').toBeGreaterThan(0)
  })
})
