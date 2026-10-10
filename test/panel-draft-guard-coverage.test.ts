import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// ── El candado de la guarda de borrador: ningún diálogo con formulario sin ella (quick 261009-tzd) ─
//
// POR QUÉ EXISTE, y es la mitad del valor de este arreglo. La guarda `guardDraftOnDismiss`
// (`lib/panel-draft.ts`) se escribió en la Phase 23 y quedó A MITAD DE CAMINO: durante casi un año
// vivió en los tres diálogos de Ajustes y en las dos altas, y en NINGÚN otro. El resultado lo
// encontró el dueño con el teléfono en la mano durante la UAT de la Phase 2 de v0.31: cargó una
// "Nueva venta" entera en Finanzas, tocó afuera sin querer y la perdió completa, sin aviso. Después
// le pasó lo mismo con "Nuevo cliente".
//
// Nada en el repo podía denunciar ese hueco. No lo ve `tsc` (un `onOpenChange={setSaleModal}` es
// perfectamente válido), no lo ve `npm run build`, no lo ve ninguna suite —ninguna renderiza el
// panel— y la UAT visual sólo lo encuentra si al que prueba se le ocurre tocar afuera con el
// formulario lleno, que es exactamente lo que no pasó en nueve meses. Sin este candado la próxima
// pantalla nace sin guarda, que es LITERALMENTE cómo llegamos acá.
//
// POR QUÉ LEE CÓDIGO FUENTE. `vitest.config.mts` corre `environment: 'node'`: no hay jsdom, no hay
// Testing Library, no hay Playwright, y el milestone prohíbe paquetes nuevos. Los clientes del panel
// llaman hooks de router en su cuerpo, así que no se pueden montar. Leer la fuente es la única
// herramienta que este repo tiene, y para este invariante alcanza: "el `onOpenChange` de este diálogo
// pasa por la guarda" es una propiedad del CÓDIGO ESCRITO, no del render. Mismo molde que
// `test/panel-nav-chrome.test.ts`, que es de donde salen los dos primeros helpers.
//
// ⚠ LA TRAMPA DEL REGEX QUE ESTE ARCHIVO EVITA, medida en la misma sesión que lo escribió. El primer
// detector de controles fue `/<Input[^>]*?>/`, y daba CERO sobre 88 `<Input>` reales: la clase
// negada se corta en el primer `>`, y el primer `>` de un `<Input>` de este repo casi siempre es el
// de una arrow function de su `onChange={e => …}`, no el cierre de la etiqueta. Con ese regex el
// barrido reportaba "0 de 88" y parecía que no había NADA que arreglar. Por eso acá los controles se
// detectan por la ETIQUETA DE APERTURA sola (`<Input` + un delimitador) y nunca matcheando el
// elemento entero: no hay cierre que buscar, así que no hay nada que se pueda cortar de más.
//
// LA REGLA DE HONESTIDAD (la lección que esta fase pagó cuatro veces: cuatro candados que estaban
// verdes y no medían nada). Cada aserción de este archivo afirma PRIMERO que encontró algo:
// archivos > 0, diálogos > 0, diálogos EXIGIDOS > 0, diálogos guardados > 0. Un recorte vacío
// —porque un componente se renombró, una carpeta se movió o la guarda cambió de nombre— haría pasar
// por vacío cualquier barrido de "no hay ninguno que falte", y el candado creería estar mirando algo
// que no mira.
//
// ⚠ SI UN CASO SE PONE ROJO, EL ARREGLO VA EN LA PANTALLA, NO ACÁ. El rojo dice "este diálogo tiene
// un formulario adentro y su cierre no pasa por la guarda": se arregla cableando la guarda, con su
// señal de sucio y su aviso duplicado adentro del popup. Si de verdad NO tiene borrador que perder,
// el diálogo no debería tener controles de formulario adentro.

// ── Los dos helpers heredados ───────────────────────────────────────────────────────────────────
// Copiados TAL CUAL de test/panel-nav-chrome.test.ts (que a su vez los tomó de
// test/panel-history-sidebar.test.ts). No se reinventan: que el molde sea el mismo es lo que hace
// que un rojo de acá se lea igual que un rojo de allá.

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

/** Borra comentarios JSX, de bloque y de línea, en ese orden. Preserva el `//` de las URLs. */
function sinComentarios(src: string): string {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/**
 * Descontar comentarios NO es cosmética en este archivo: las cinco pantallas que se arreglaron
 * explican en prosa, adentro del código, por qué el `onOpenChange` pelado era un bug. Sin descontar,
 * un comentario que NOMBRA la guarda haría pasar un diálogo que no la usa.
 */

// ── Las dos carpetas vigiladas ──────────────────────────────────────────────────────────────────
// Todo el panel: las pantallas (`app/(dashboard)`) y los componentes que montan diálogos propios
// (`components/dashboard`). Las dos, y no sólo la primera, porque DOS de los diálogos con formulario
// del panel viven en la segunda —el manager de canchas y el modal de planes— y uno de ellos es el que
// este barrido destapó.
const CARPETAS = ['app/(dashboard)', 'components/dashboard'] as const

function tsxDe(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
    // Se concatena con '/' a mano y NO con path.join: el resultado viaja a mensajes de error y a
    // `read()`, y en Windows `join` produce separadores invertidos que ensucian el rojo.
    const rel = `${dir}/${e.name}`
    if (e.isDirectory()) tsxDe(rel, out)
    else if (e.isFile() && e.name.endsWith('.tsx')) out.push(rel)
  }
  return out
}

// ── El recorte de un overlay: su etiqueta de apertura y su cuerpo ───────────────────────────────

/**
 * Índice del `>` que cierra la etiqueta de apertura, CONTANDO LLAVES.
 *
 * Hace falta contar: la etiqueta de apertura de un overlay guardado lleva
 * `onOpenChange={guardDraftOnDismiss(isSaleDirty, () => setSaleModal(false), …)}`, y ese `>` de la
 * arrow function está ANTES del `>` de la etiqueta. Es la misma trampa que el regex de los controles,
 * entrando por la otra puerta.
 */
function finDeEtiqueta(src: string, desde: number): number {
  let llaves = 0
  for (let i = desde; i < src.length; i++) {
    const c = src[i]
    if (c === '{') llaves++
    else if (c === '}') llaves--
    else if (c === '>' && llaves === 0) return i
  }
  return -1
}

type Overlay = { etiqueta: string; cuerpo: string }

/**
 * Todos los `<Dialog …>…</Dialog>` (o `<Drawer>`) del archivo, con su apertura y su cuerpo separados.
 *
 * El cierre se busca BALANCEANDO la etiqueta, no con el primer `</Dialog>`: hay pantallas con un
 * diálogo adentro de otro en el árbol y el primer cierre pertenecería al de adentro.
 */
function overlays(src: string, tag: string): Overlay[] {
  const abre = `<${tag}`
  const cierra = `</${tag}>`
  const inicio = new RegExp(`<${tag}(?=[\\s>])`, 'g')
  const res: Overlay[] = []
  let m: RegExpExecArray | null
  while ((m = inicio.exec(src))) {
    const fin = finDeEtiqueta(src, m.index)
    if (fin === -1) continue
    const etiqueta = src.slice(m.index, fin + 1)
    // Auto-cerrado (`<Dialog … />`): no tiene cuerpo.
    if (src[fin - 1] === '/') {
      res.push({ etiqueta, cuerpo: '' })
      continue
    }
    let prof = 1
    let i = fin + 1
    while (i < src.length && prof > 0) {
      if (src.startsWith(abre, i) && /[\s>]/.test(src[i + abre.length] ?? '')) { prof++; i += abre.length; continue }
      if (src.startsWith(cierra, i)) { prof--; i += cierra.length; continue }
      i++
    }
    res.push({ etiqueta, cuerpo: src.slice(fin + 1, i) })
  }
  return res
}

/**
 * ¿Este overlay tiene un FORMULARIO adentro?
 *
 * Por etiqueta de apertura sola, nunca por el elemento entero (ver la trampa del regex arriba). La
 * lista cubre los cuatro controles del design system del panel (`Input`, `Textarea`, `Select` y el
 * `TimeField` de la agenda), el combobox propio de Finanzas, los nativos en minúscula —que es como
 * el importador de CSV monta su `<input type="file">` y Ajustes la foto del profesional— y el
 * `register(...)` de react-hook-form, que es la forma que usa el alta de cliente.
 */
const CONTROLES = /<(Input|Textarea|Select|TimeField|ProductCombobox|input|textarea|select)[\s/>]|\bregister\w*\(/

/**
 * ¿El cierre de este overlay pasa por la guarda?
 *
 * Dos formas, las dos vivas en el repo:
 *   · DIRECTA — `onOpenChange={guardDraftOnDismiss(isSaleDirty, close, aviso)}`, que es como la usan
 *     Ajustes, Finanzas, Clientes, Canchas y el modal de planes;
 *   · INDIRECTA — `onOpenChange={handleDialogDismiss}`, con el handler armado adentro de un
 *     `useCallback` porque su señal de sucio vive en una ref (las dos altas: `nuevo-turno-form` y
 *     `nuevo-abono-form`, donde `react-hooks/refs` prohíbe la forma directa). Se resuelve el nombre
 *     contra su definición en el mismo archivo.
 */
function pasaPorLaGuarda(fuente: string, etiqueta: string): boolean {
  if (/guardDraftOn(Dismiss|DrawerDismiss)\b/.test(etiqueta)) return true
  const ident = etiqueta.match(/onOpenChange=\{([A-Za-z_$][\w$]*)\}/)
  if (!ident) return false
  const at = [`const ${ident[1]} =`, `function ${ident[1]}`]
    .map(marca => fuente.indexOf(marca))
    .filter(i => i !== -1)
    .sort((a, b) => a - b)[0]
  if (at === undefined) return false
  // Ventana acotada: la definición del handler, no "en algún lado del archivo aparece la guarda".
  return /guardDraftOn(Dismiss|DrawerDismiss)\b/.test(fuente.slice(at, at + 800))
}

// ── El barrido, una sola vez para todos los casos ───────────────────────────────────────────────

type Hallado = { archivo: string; tag: string; open: string; control: string; guardada: boolean }

const ARCHIVOS = CARPETAS.flatMap(c => tsxDe(c))
const TODOS: Hallado[] = []
for (const archivo of ARCHIVOS) {
  const fuente = sinComentarios(read(archivo))
  for (const tag of ['Dialog', 'Drawer'] as const) {
    for (const o of overlays(fuente, tag)) {
      TODOS.push({
        archivo,
        tag,
        // Identificador legible del diálogo en el rojo: su propia prop `open`.
        open: (o.etiqueta.match(/open=\{[^}]*\}|open(?=[\s>])/) ?? ['(sin open)'])[0],
        control: (CONTROLES.exec(o.cuerpo) ?? [''])[0],
        guardada: pasaPorLaGuarda(fuente, o.etiqueta),
      })
    }
  }
}
// Los que EXIGEN la guarda: tienen un control de formulario en su propio cuerpo.
const EXIGIDOS = TODOS.filter(d => d.control !== '')

describe('1 · el barrido mira algo de verdad (guardas de honestidad)', () => {
  it('encuentra las pantallas del panel', () => {
    // Si una carpeta se renombra o se mueve, esto cae ANTES de que los casos de abajo pasen por vacío.
    expect(ARCHIVOS.length).toBeGreaterThan(20)
  })

  it('encuentra los overlays del panel', () => {
    // Medido el 2026-10-09: 32 entre `<Dialog>` y `<Drawer>`. El piso es deliberadamente holgado —no
    // es un inventario, es un detector de recorte vacío— pero no puede ser cero.
    expect(TODOS.length).toBeGreaterThan(20)
  })

  it('encuentra overlays que EXIGEN la guarda', () => {
    // El caso más importante del bloque: si el detector de controles se rompe (la trampa del regex),
    // `EXIGIDOS` queda vacío y el caso 2 pasaría sin mirar nada. Medido: 10.
    expect(EXIGIDOS.length).toBeGreaterThan(5)
  })

  it('encuentra overlays que YA pasan por la guarda', () => {
    // Si `pasaPorLaGuarda` se rompe, esto cae — en vez de poner rojo medio panel por el motivo
    // equivocado y mandar a cablear una guarda que ya estaba.
    expect(TODOS.filter(d => d.guardada).length).toBeGreaterThan(5)
  })

  it('el detector de controles NO se corta en el `>` de una arrow function', () => {
    // La trampa, fijada como caso: con `/<Input[^>]*?>/` esto daría 0 y el candado entero sería humo.
    const conArrow = '<Input value={x} onChange={e => setX(e.target.value)} />'
    expect(CONTROLES.test(conArrow)).toBe(true)
  })

  it('el recorte de la etiqueta NO se corta en el `>` de la guarda', () => {
    // Misma trampa, del otro lado: la etiqueta de apertura de un diálogo guardado lleva una arrow
    // function, y cortar ahí partiría la etiqueta justo antes de su `onOpenChange`.
    const etiqueta = '<Dialog open={m} onOpenChange={guardDraftOnDismiss(isD, () => setM(false), avisar)}>'
    const fin = finDeEtiqueta(etiqueta, 0)
    expect(fin).toBe(etiqueta.length - 1)
  })
})

describe('2 · todo overlay del panel con un formulario adentro pasa por la guarda', () => {
  it('no queda ninguno sin guarda', () => {
    const sinGuarda = EXIGIDOS.filter(d => !d.guardada)
    // El rojo NOMBRA el archivo, el diálogo y el control que lo delata: sin eso, un rojo de este
    // barrido manda a leer 33 overlays a mano.
    const detalle = sinGuarda.map(d => `${d.archivo} <${d.tag} ${d.open}> (tiene ${d.control.trim()})`)
    expect(detalle).toEqual([])
  })
})

describe('3 · la guarda y su copy viven en UN solo módulo', () => {
  const panelDraft = read('lib/panel-draft.ts')

  it('las dos guardas y las cuatro cadenas del aviso se exportan desde lib/panel-draft.ts', () => {
    // El candado de la fuente única: si alguien copia la guarda o la copy adentro de una pantalla,
    // se renombran a medias y el panel empieza a hablar con dos voces.
    for (const sym of [
      'export function guardDraftOnDismiss',
      'export function guardDraftOnDrawerDismiss',
      'export const UNSAVED_CHANGES_MESSAGE',
      'export const UNSAVED_CHANGES_HINT',
      'export const UNSAVED_NEW_HINT',
      'export const UNSAVED_CHANGES_TOAST_ID',
    ]) {
      expect(panelDraft).toContain(sym)
    }
  })

  it('ninguna pantalla define su propia versión de la guarda', () => {
    const propias = ARCHIVOS.filter(a => /function\s+guardDraftOn/.test(sinComentarios(read(a))))
    expect(propias).toEqual([])
  })

  it('toda pantalla que usa la guarda avisa TAMBIÉN adentro del popup', () => {
    // ⚠ EL AVISO LO DA EL CALLER, NO LA GUARDA (code-review WR-08 de la Phase 23): la región
    // `aria-live` del toast de sonner vive FUERA del portal del diálogo y el modal la marca `inert`,
    // así que el toast se VE pero no se ANUNCIA. Un consumidor que sólo tire el toast deja al lector
    // de pantalla sin ninguna pista de por qué el diálogo no se cerró.
    const consumidores = ARCHIVOS.filter(a => /guardDraftOn(Dismiss|DrawerDismiss)\(/.test(sinComentarios(read(a))))
    expect(consumidores.length).toBeGreaterThan(4)
    const sinRegionViva = consumidores.filter(a => {
      const src = sinComentarios(read(a))
      return !/aria-live="assertive"/.test(src) || !/UNSAVED_(CHANGES|NEW)_ANNOUNCE/.test(src)
    })
    expect(sinRegionViva).toEqual([])
  })
})
