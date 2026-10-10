import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// ── El candado del zoom de iOS: ningún campo editable del panel por debajo de 16px (quick 261009-tze)
//
// POR QUÉ EXISTE, y es la mitad del valor del arreglo. iOS Safari hace zoom sobre CUALQUIER campo
// editable enfocado cuyo `font-size` sea menor a 16px — es una decisión de la plataforma, no un bug
// de la app: el navegador amplía para que el teclado virtual escriba sobre texto legible. Y después
// del zoom deja el viewport visual corrido, que es el "contenido descentrado, el header a medias"
// que el dueño reportó con capturas en la UAT de la Phase 2 de v0.31. Son UN defecto: sin zoom no hay
// descentrado.
//
// El componente base del panel SIEMPRE estuvo bien (`components/ui/input.tsx` y `textarea.tsx` usan
// `text-base`). Lo que estaba mal eran los CALL SITES, que lo pisaban con `text-sm`: tailwind-merge
// resuelve ese conflicto a favor del call site, así que el campo enfocado quedaba en 14px. Y eso se
// fue acumulando de a uno durante meses hasta llegar a 24 campos sobre 92 — porque nada en el repo
// podía denunciarlo. No lo ve `tsc` (`className="h-8 text-sm"` es un string válido), no lo ve
// `npm run build` (la clase existe y compila perfecto), no lo ve ninguna suite —ninguna renderiza el
// panel— y la UAT visual sólo lo encuentra si al que prueba le toca un iPhone REAL: en el simulador
// de Chrome DevTools el auto-zoom NO pasa, porque es comportamiento de Safari en iOS, no del ancho
// del viewport. Sin este candado el próximo input nace chico, que es LITERALMENTE cómo llegamos a 24.
//
// POR QUÉ LEE CÓDIGO FUENTE. `vitest.config.mts` corre `environment: 'node'`: no hay jsdom, no hay
// Testing Library, no hay Playwright, y el milestone prohíbe paquetes nuevos. Los clientes del panel
// llaman hooks de router en su cuerpo, así que no se pueden montar. Leer la fuente es la única
// herramienta que este repo tiene, y para este invariante alcanza: "este campo declara un font-size
// que aplica en mobile" es una propiedad del CÓDIGO ESCRITO. Mismo molde que
// `test/panel-draft-guard-coverage.test.ts` y `test/panel-nav-chrome.test.ts`, de donde salen los
// helpers.
//
// ⚠ LA TRAMPA DEL REGEX QUE ESTE ARCHIVO EVITA, medida en la misma sesión que lo escribió (y la misma
// que ya había costado una medición falsa en el quick 261009-tzd). El primer detector fue
// `/<Input[^>]*?>/`, y daba CERO sobre 82 `<Input>` reales: la clase negada se corta en el primer
// `>`, y el primer `>` de un `<Input>` de este repo casi siempre es el de la arrow function de su
// `onChange={e => …}`, no el cierre de la etiqueta. Con ese regex el barrido reportaba "0 de 88" y
// parecía que no había NADA que arreglar. Acá la etiqueta de apertura se recorta CONTANDO LLAVES
// (`finDeEtiqueta`, heredado tal cual de 261009-tzd), que es la única forma que no se puede cortar de
// más. Las dos trampas están fijadas como casos en el bloque 1.
//
// ⚠ POR QUÉ LOS `<SelectTrigger>` NO ESTÁN EN LA LISTA, aunque dos de `/clients` usen `text-xs`.
// El auto-zoom de iOS se dispara al enfocar un control EDITABLE de texto, porque existe para el
// teclado virtual. `SelectPrimitive.Trigger` de Base UI renderiza un `<button>` nativo (verificado en
// `node_modules/@base-ui/react/select/trigger/SelectTrigger.js`: `nativeButton = true` y
// `useRenderElement('button', …)`), no un `<input>`: no abre teclado, no hay nada que ampliar para
// escribir, y no dispara zoom. Quedan en `text-xs` a propósito. Si algún día el trigger pasara a ser
// un combobox con entrada de texto, entra a `EDITABLES` y el candado lo empieza a exigir.
//
// ⚠ SI UN CASO SE PONE ROJO, EL ARREGLO VA EN LA PANTALLA, NO ACÁ. El rojo dice "este campo del panel
// declara un font-size menor a 16px que aplica en mobile": se arregla prefijando el tamaño chico con
// el breakpoint (`text-sm` → `text-base sm:text-sm`, `text-xs` → `text-base sm:text-xs`). A <640px
// queda en 16px y iOS no tiene MOTIVO para hacer zoom; a ≥640px se ve exactamente igual que antes.
// Lo que NO es un arreglo válido: `maximum-scale=1, user-scalable=no` en el export `viewport`.
// Funciona, pero le saca el pinch-zoom a todo el mundo —incluida la gente que lo necesita para
// leer—, es falla de WCAG 1.4.4 (Resize Text) con la accesibilidad declarada no negociable en el
// CLAUDE.md, y trata el síntoma en vez del motivo. El bloque 4 lo deja clavado.

// ── Los helpers heredados ───────────────────────────────────────────────────────────────────────

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

/**
 * Borra comentarios JSX, de bloque y de línea PRESERVANDO LOS OFFSETS: cada carácter borrado se
 * reemplaza por un espacio y los saltos de línea se conservan.
 *
 * Esto último no es cosmética. La versión de `test/panel-draft-guard-coverage.test.ts` borra de
 * verdad, y ahí da igual porque su rojo nombra el diálogo por su prop `open`. Acá el rojo tiene que
 * nombrar la LÍNEA —es la única forma de encontrar un `className` entre 92 campos— y con los
 * comentarios borrados de verdad el número sale corrido: medido, hasta 9 líneas de diferencia en
 * `clients-client.tsx`, que es justo el archivo con más comentarios y más campos.
 *
 * El `(^|[^:])` del comentario de línea preserva el `//` de las URLs.
 */
function blanquearComentarios(src: string): string {
  const aEspacios = (m: string) => m.replace(/[^\n]/g, ' ')
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, aEspacios)
    .replace(/\/\*[\s\S]*?\*\//g, aEspacios)
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1: string) => p1 + aEspacios(m.slice(p1.length)))
}

/**
 * Índice del `>` que cierra la etiqueta de apertura, CONTANDO LLAVES.
 *
 * Copiado TAL CUAL de `test/panel-draft-guard-coverage.test.ts`. Hace falta contar porque el `>` de
 * un `onChange={e => …}` está ANTES del `>` de la etiqueta; ver la trampa del regex arriba.
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

// ── Las dos carpetas vigiladas ──────────────────────────────────────────────────────────────────
// Todo el panel: las pantallas (`app/(dashboard)`) y los componentes que montan campos propios
// (`components/dashboard`). Las dos, y no sólo la primera, porque 5 de los 24 campos que este arreglo
// subió viven en la segunda (el panel de historia clínica, el manager de categorías y el alta de
// abono). `components/crm` y `components/ui` quedan FUERA a propósito: el CRM es otra superficie
// (`/admin`, pantalla de escritorio del operador) y los `components/ui` son compartidos con el
// landing y con la página pública de reservas, que nadie pidió tocar por un input del panel.
const CARPETAS = ['app/(dashboard)', 'components/dashboard'] as const

function tsxDe(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
    // Se concatena con '/' a mano y NO con path.join: el resultado viaja a mensajes de error y a
    // `read()`, y en Windows `join` produce separadores invertidos que ensucian el rojo.
    const rel = `${dir}/${e.name}`
    if (e.isDirectory()) tsxDe(rel, out)
    else if (e.isFile() && e.name.endsWith('.tsx') && !e.name.endsWith('.test.tsx')) out.push(rel)
  }
  return out
}

// ── Qué cuenta como campo editable ──────────────────────────────────────────────────────────────

/**
 * Los componentes del panel sobre los que iOS puede hacer zoom.
 *
 * `Input` y `Textarea` son el design system. `PasswordInput` y `TimeField` ENVUELVEN un `<Input>` y
 * le pasan el `className` derecho, así que un `text-sm` en el call site les llega igual — el
 * `TimeField` es el caso que el barrido original del todo se perdió, y son 4 de los 24. `input` y
 * `textarea` en minúscula son los nativos: los steppers numéricos del panel son `<input type=number>`
 * a mano, y son los otros 4 que faltaban.
 */
const EDITABLES = ['Input', 'Textarea', 'PasswordInput', 'TimeField', 'input', 'textarea'] as const

/**
 * Los `type` de `<input>` que NO son editables de texto: no abren teclado, no hay zoom.
 *
 * Son 16 de los 20 `<input>` nativos del panel (`checkbox` de Ajustes, `radio` de la agenda y del
 * alta de abono, `file` del importador de CSV y de las fotos). Exigirles 16px sería ruido puro: el
 * `font-size` de un checkbox no se ve en ninguna parte.
 */
const NO_EDITABLE = /type="(?:checkbox|radio|file|color|range|hidden|submit|button|image|reset)"/

/**
 * ¿Esta clase de Tailwind declara un font-size MENOR a 16px que aplica a <640px?
 *
 * Dos condiciones, y las dos importan:
 *   · el tamaño es chico — `text-xs` (12px), `text-sm` (14px) o un arbitrario `text-[13px]` /
 *     `text-[0.875rem]` por debajo de 16px / 1rem;
 *   · y aplica en MOBILE — o sea sin prefijo de breakpoint, o con un `max-*:` (que es max-width y
 *     por lo tanto SÍ alcanza al teléfono). Un `sm:text-sm` es min-width:640px y no toca el mobile,
 *     que es exactamente por qué `text-base sm:text-sm` es el arreglo.
 *
 * ⚠ El prefijo se mira con `(?:^|\s)`, no con un `\b`: `\b` matchearía en el medio de `sm:text-sm`
 * (hay borde de palabra después del `:`) y el candado daría por chico justo el arreglo.
 */
function esChicaEnMobile(clase: string): boolean {
  const m = /^(?:max-(?:sm|md|lg|xl|2xl):)?text-(xs|sm|\[([^\]]+)\])$/.exec(clase)
  if (!m) return false
  if (m[1] === 'xs' || m[1] === 'sm') return true
  const arb = m[2] ?? ''
  const px = /^([\d.]+)px$/.exec(arb)
  if (px) return Number(px[1]) < 16
  const rem = /^([\d.]+)rem$/.exec(arb)
  if (rem) return Number(rem[1]) < 1
  // Cualquier otra unidad (em, %, clamp…) no se puede evaluar sin el contexto: no se acusa.
  return false
}

/** Ídem, pero del lado bueno: ¿esta clase pone el cuerpo en 16px o más en mobile? */
function esGrandeEnMobile(clase: string): boolean {
  return /^text-(base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)$/.test(clase)
}

/**
 * Todas las clases que el `className` de una etiqueta puede llegar a aplicar.
 *
 * Cubre las tres formas vivas en el panel: el string pelado (`className="h-8 text-sm"`), el template
 * y el `cn(...)` / ternario con varias ramas (`className={cn('h-8', activo && 'text-sm')}`). En las
 * dos últimas se juntan TODOS los literales de la expresión y se tratan como si todos aplicaran: un
 * `text-sm` que aparece en una sola rama igual deja el campo chico cuando esa rama se cumple, y para
 * este invariante la rama es irrelevante. Deliberadamente conservador — prefiere un falso rojo (que
 * se arregla prefijando) antes que un falso verde.
 */
function clasesDe(etiqueta: string): string[] {
  const m = /className=(?:"([^"]*)"|\{([\s\S]*)\})/.exec(etiqueta)
  if (!m) return []
  const crudo = m[1] !== undefined
    ? [m[1]]
    : [...(m[2] ?? '').matchAll(/["'`]([^"'`]*)["'`]/g)].map(x => x[1])
  return crudo.flatMap(s => s.split(/\s+/)).filter(Boolean)
}

// ── El barrido, una sola vez para todos los casos ───────────────────────────────────────────────

type Campo = {
  archivo: string
  tag: string
  linea: number
  /** Las clases chicas que aplican en mobile. Si tiene alguna, iOS hace zoom. */
  chicas: string[]
  /** Las clases chicas que SÍ están prefijadas con un breakpoint (o sea, el arreglo aplicado). */
  prefijadas: string[]
  /** ¿Declara explícitamente un tamaño ≥16px? */
  grande: boolean
}

const ARCHIVOS = CARPETAS.flatMap(c => tsxDe(c))
const CAMPOS: Campo[] = []
for (const archivo of ARCHIVOS) {
  const fuente = blanquearComentarios(read(archivo))
  for (const tag of EDITABLES) {
    // El lookahead es `(?![A-Za-z0-9_])` y NO una clase `[\s/>]`: así `<Input` matchea seguido de
    // espacio, de newline, de `/` o de `>`, y `<InputPrimitive` no. (Medido en esta misma sesión: la
    // variante con `[\\s/>]` dentro de un TEMPLATE LITERAL se come el backslash — `\s` no es una
    // escape sequence válida ahí y queda como `s` literal — y el detector daba 0 sobre 82.)
    const inicio = new RegExp(`<${tag}(?![A-Za-z0-9_])`, 'g')
    let m: RegExpExecArray | null
    while ((m = inicio.exec(fuente))) {
      const fin = finDeEtiqueta(fuente, m.index)
      if (fin === -1) continue
      const etiqueta = fuente.slice(m.index, fin + 1)
      if (NO_EDITABLE.test(etiqueta)) continue
      const clases = clasesDe(etiqueta)
      CAMPOS.push({
        archivo,
        tag,
        linea: fuente.slice(0, m.index).split('\n').length,
        chicas: clases.filter(esChicaEnMobile),
        prefijadas: clases.filter(c => /^(sm|md|lg|xl|2xl):text-(xs|sm|\[)/.test(c)),
        grande: clases.some(esGrandeEnMobile),
      })
    }
  }
}

describe('1 · el barrido mira algo de verdad (guardas de honestidad)', () => {
  it('encuentra las pantallas del panel', () => {
    // Si una carpeta se renombra o se mueve, esto cae ANTES de que el caso del bloque 2 pase por
    // vacío. Medido el 2026-10-09: 46 archivos .tsx.
    expect(ARCHIVOS.length).toBeGreaterThan(20)
  })

  it('encuentra los campos editables del panel', () => {
    // Medido el 2026-10-09: 92. El piso es deliberadamente holgado —no es un inventario, es un
    // detector de recorte vacío— pero no puede ser cero. Con el regex ingenuo esto daba 0.
    expect(CAMPOS.length).toBeGreaterThan(50)
  })

  it('encuentra campos que declaran su propio font-size', () => {
    // Si `clasesDe` se rompe (un `className` con una forma nueva, un rename de la prop), devuelve
    // listas vacías y el caso del bloque 2 pasaría sin mirar NADA. Medido: 36 campos con un tamaño
    // declarado — los 24 de este arreglo más una docena que ya estaba en `text-base`/`text-2xl`.
    const conTamaño = CAMPOS.filter(c => c.grande || c.chicas.length > 0 || c.prefijadas.length > 0)
    expect(conTamaño.length).toBeGreaterThan(10)
  })

  it('encuentra los campos que este arreglo prefijó', () => {
    // LA guarda más importante del bloque. Los 24 campos arreglados quedaron con un `sm:text-sm`
    // (o `sm:text-xs`), que es una clase que `clasesDe` tiene que VER y que `esChicaEnMobile` tiene
    // que NO acusar. Si cualquiera de las dos se rompe, esta cuenta se desploma a 0 y el candado se
    // delata en vez de quedar verde mirando el vacío. Medido el 2026-10-09: 24.
    // El piso es holgado a propósito y NO 24 exactos: esto es un detector de recorte vacío, no un
    // inventario. Con el número exacto, borrar un campo del panel por un motivo legítimo pondría
    // rojo un candado que no tiene nada que ver con el borrado.
    const arreglados = CAMPOS.filter(c => c.prefijadas.length > 0)
    expect(arreglados.length).toBeGreaterThan(15)
  })

  it('el detector NO se corta en el `>` de una arrow function', () => {
    // La trampa, fijada como caso: con `/<Input[^>]*?>/` el recorte terminaría en el `>` de la
    // flecha y el `className` quedaría afuera ⇒ 0 chicos y candado de humo.
    const et = '<Input value={x} onChange={e => setX(e.target.value)} className="h-8 text-sm" />'
    const fin = finDeEtiqueta(et, 0)
    expect(fin).toBe(et.length - 1)
    expect(clasesDe(et.slice(0, fin + 1))).toContain('text-sm')
  })

  it('clasifica bien las cuatro formas de declarar el tamaño', () => {
    // Las dos que tienen que acusar…
    expect(esChicaEnMobile('text-sm')).toBe(true)
    expect(esChicaEnMobile('text-xs')).toBe(true)
    expect(esChicaEnMobile('text-[13px]')).toBe(true)
    expect(esChicaEnMobile('max-sm:text-sm')).toBe(true)
    // …y las que NO, que es la mitad que importa: el arreglo usa justamente estas.
    expect(esChicaEnMobile('sm:text-sm')).toBe(false)
    expect(esChicaEnMobile('md:text-sm')).toBe(false)
    expect(esChicaEnMobile('text-base')).toBe(false)
    expect(esChicaEnMobile('text-[16px]')).toBe(false)
    expect(esChicaEnMobile('text-muted-foreground')).toBe(false)
  })

  it('lee las tres formas de `className` que usa el panel', () => {
    expect(clasesDe('<Input className="h-8 text-sm" />')).toContain('text-sm')
    expect(clasesDe('<Input className={cn("h-8", malo && "text-sm")} />')).toContain('text-sm')
    expect(clasesDe('<Input className={`h-8 ${x} text-sm`} />')).toContain('text-sm')
  })
})

describe('2 · ningún campo editable del panel queda por debajo de 16px en mobile', () => {
  it('no queda ninguno chico', () => {
    const chicos = CAMPOS.filter(c => c.chicas.length > 0)
    // El rojo NOMBRA archivo, línea, componente y la clase que lo delata: sin eso, un rojo de este
    // barrido manda a leer 92 campos a mano.
    const detalle = chicos.map(c => `${c.archivo}:${c.linea} <${c.tag}> tiene ${c.chicas.join(' ')} — usá text-base sm:${c.chicas[0]}`)
    expect(detalle).toEqual([])
  })
})

describe('3 · el componente base sigue siendo el que pone los 16px', () => {
  it('`Input` y `Textarea` declaran `text-base`', () => {
    // El otro extremo del mismo invariante: si alguien "limpia" el `text-base` del design system,
    // los 92 campos del panel se vuelven chicos de una y el bloque 2 no lo vería (ninguno declara
    // tamaño propio en mobile — justamente por eso el arreglo es `text-base sm:text-sm`).
    for (const base of ['components/ui/input.tsx', 'components/ui/textarea.tsx']) {
      expect(read(base)).toMatch(/\btext-base\b/)
    }
  })
})

describe('4 · el zoom NO se desactiva a nivel viewport (WCAG 1.4.4)', () => {
  it('ningún `viewport` del repo declara maximum-scale ni user-scalable', () => {
    // El arreglo descartado, clavado. Se barre todo `app/` y no sólo el layout del panel: puesto en
    // `app/layout.tsx` el efecto sería peor (alcanzaría también al landing y a la página pública de
    // reservas, que son superficies de los CLIENTES de los negocios).
    const conFlag: string[] = []
    const recorrer = (dir: string) => {
      for (const e of readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`
        if (e.isDirectory()) recorrer(rel)
        else if (e.isFile() && /\.tsx?$/.test(e.name) && /maximumScale|userScalable|maximum-scale|user-scalable/.test(read(rel))) conFlag.push(rel)
      }
    }
    recorrer('app')
    expect(conFlag).toEqual([])
  })

  it('el layout del panel sigue declarando su viewport (la guarda de honestidad del caso de arriba)', () => {
    // Sin esto, borrar el export `viewport` entero dejaría el caso anterior verde por vacío.
    const layout = read('app/(dashboard)/layout.tsx')
    expect(layout).toMatch(/export const viewport: Viewport = \{/)
    expect(layout).toMatch(/viewportFit: 'cover'/)
  })
})
