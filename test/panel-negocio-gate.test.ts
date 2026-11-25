import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

// ── Quick 261124-neg — el panel no vuelve a resolver el negocio con `.eq('owner_id', …).single()` ──
//
// EL BUG QUE ESTE GATE IMPIDE QUE VUELVA. El layout del panel, `/` y las 14 pantallas leían el negocio
// con `.eq('owner_id', user.id).single()` y, si no volvía `data`, mandaban a `/onboarding`. `.single()`
// devuelve error con 0 filas, con 2+ filas (`owner_id` no es unique) y con errores de red/PostgREST, y
// el código sólo miraba `data`: un corte momentáneo mandaba al dueño al wizard (la puerta a un segundo
// negocio) y un dueño con dos negocios no entraba nunca (loop panel → wizard → integraciones → panel).
//
// EL ARREGLO que congela: todas esas lecturas pasan por `lib/negocio-del-dueno.ts` (`negocioDelPanel`
// en las pantallas, `negocioDelDueno` donde hace falta otra política), que separa los tres casos.
//
// QUICK 261124-ubl lo extiende a `app/api/**`: las rutas del panel también resolvían el negocio con su
// propio `.single()` (un dueño con dos negocios recibía 404 al crear un cliente, un turno, un abono…).
// En una API se usa `negocioDelDueno` (discriminado: la API responde, no redirige), NUNCA
// `negocioDelPanel`. Además del single, el gate de lectura de abajo impide cualquier lectura de
// `businesses` por `owner_id` sin `id` fuera del helper (maybeSingle, limit, lo que sea): una resolución
// propia puede elegir un negocio distinto del que muestra el panel.
//
// SUITE PURA: lee el fuente, no importa './env'. Molde: test/forms-no-get-leak.test.ts (de donde se
// copian `sinComentarios`, el walker y `rutaPosix`).

const read = (rel: string) => readFileSync(rel, 'utf8')

/** Borra comentarios JSX, de bloque y de línea, en ese orden. Copiado de forms-no-get-leak.test.ts. */
function sinComentarios(src: string): string {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/** Los .ts/.tsx bajo `dir` (sin tests). Walker copiado de forms-no-get-leak.test.ts. */
function fuentesDe(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue
    const full = join(dir, e.name)
    if (e.isDirectory()) fuentesDe(full, acc)
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) acc.push(full)
  }
  return acc
}

/** Ruta relativa en POSIX: en Windows `relative()` devuelve `\`, y las rutas esperadas van con `/`. */
function rutaPosix(abs: string): string {
  return relative(process.cwd(), abs).split(sep).join('/')
}

/**
 * `.eq` con primer argumento literal `owner_id` (cualquier comilla), cero o más llamadas encadenadas
 * sin paréntesis anidados en el medio (cruzando saltos de línea), y después `.single()`. Se aplica
 * sobre el fuente YA sin comentarios.
 */
const OWNER_ID_SINGLE = /\.eq\(\s*(['"`])owner_id\1\s*,[^)]*\)(?:\s*\.\w+\([^()]*\))*\s*\.single\(\s*\)/

// Con `sinComentariosLexico` (definido abajo, quick 261124-ubl) y no con `sinComentarios`: la regex de
// bloque de éste se come el código que sigue a un `/*` dentro de un comentario de línea.
function usaSingleTrasOwnerId(src: string): boolean {
  return OWNER_ID_SINGLE.test(sinComentariosLexico(src))
}

/**
 * Los 16 archivos que este quick migró. Es la GUARDA DE BARRIDO VACÍO: si el walker deja de entrar a
 * `app/(dashboard)` el gate pasaría por vacío. Si uno se renombra o se borra, el gate falla y obliga
 * a actualizar la lista a mano.
 */
const ESPERADOS = [
  'app/(dashboard)/layout.tsx',
  'app/page.tsx',
  'app/(dashboard)/abonos/page.tsx',
  'app/(dashboard)/agenda/page.tsx',
  'app/(dashboard)/appointments/page.tsx',
  'app/(dashboard)/clients/page.tsx',
  'app/(dashboard)/clinical-history/page.tsx',
  'app/(dashboard)/consultorios/page.tsx',
  'app/(dashboard)/dashboard/page.tsx',
  'app/(dashboard)/equipo/page.tsx',
  'app/(dashboard)/finances/page.tsx',
  'app/(dashboard)/mas/page.tsx',
  'app/(dashboard)/negocio/page.tsx',
  'app/(dashboard)/servicios/page.tsx',
  'app/(dashboard)/settings/page.tsx',
  'app/(dashboard)/web/page.tsx',
  // Quick 261124-ubl: las rutas de app/api que resuelven el negocio del dueño de la sesión.
  'app/api/abonos/cancel/route.ts',
  'app/api/abonos/create/route.ts',
  'app/api/appointments/cleanup-expired/route.ts',
  'app/api/appointments/create/route.ts',
  'app/api/appointments/delete/route.ts',
  'app/api/clients/create/route.ts',
  'app/api/export/clients/route.ts',
  'app/api/export/finances/route.ts',
  'app/api/google/callback/route.ts',
  'app/api/google/disconnect/route.ts',
  'app/api/google/sync/route.ts',
  'app/api/import/clients/confirm/route.ts',
  'app/api/import/clients/preview/route.ts',
  'app/api/notify/cancel/route.ts',
  'app/api/subscription/cancel/route.ts',
  'app/api/subscription/create/route.ts',
  'app/api/subscription/status/route.ts',
  'app/api/mercadopago/disconnect/route.ts',
  'app/api/mercadopago/callback/route.ts',
]

/** Archivos que pueden seguir con el patrón, con el motivo. Sumar uno es una DECISIÓN, no un descuido. */
const EXCEPCIONES: Record<string, string> = {
  'app/(dashboard)/web/_landing-actions.ts':
    'server actions que devuelven { ok: false, error: "no_business" }: no mandan al wizard. Fuera de ' +
    'scope del quick 261124-neg; follow-up anotado (un dueño con 2+ negocios recibe no_business).',
}

const PORQUE = [
  'RIESGO: `.eq(\'owner_id\', …).single()` devuelve error con 0 filas, con 2+ filas (owner_id no es',
  'unique) y con errores de red/PostgREST. Si el código sólo mira `data`, un corte momentáneo manda al',
  'dueño al wizard —que no verifica si ya hay negocio: la puerta a un segundo negocio— y un dueño con',
  'dos negocios no entra nunca (loop panel → wizard → integraciones → panel).',
  'ARREGLO: en una pantalla del panel usá `negocioDelPanel(supabase, user.id, <columnas>)` de',
  '`@/lib/negocio-del-dueno`. En una ruta de app/api o una server action, `negocioDelDueno`',
  '(discriminado: respondé con lo de siempre si no hay negocio y con un 500 si falló la lectura);',
  'NUNCA `negocioDelPanel` en una API: redirige.',
].join('\n')

describe('detector de `.eq(owner_id).single()` (fixtures)', () => {
  it.each([
    ['una línea', `supabase.from('businesses').select('*').eq('owner_id', user.id).single()`],
    [
      'multilínea',
      `await supabase
    .from('businesses')
    .select('*')
    .eq('owner_id', user.id)
    .single()`,
    ],
    ['comillas dobles', `supabase.from("businesses").select("id").eq("owner_id", user.id).single()`],
    ['con un eq intermedio', `sb.from('x').select('*').eq('owner_id', uid).eq('active', true).single()`],
  ])('da positivo: %s', (_label, src) => {
    expect(usaSingleTrasOwnerId(src)).toBe(true)
  })

  it.each([
    ['maybeSingle', `supabase.from('businesses').select('*').eq('owner_id', user.id).maybeSingle()`],
    [
      'la cadena nueva',
      `supabase.from('businesses').select(c).eq('owner_id', id).order('created_at', { ascending: true }).limit(1).maybeSingle()`,
    ],
    ['single por id (upsell de /web)', `supabase.from('businesses').select('plan').eq('id', business.id).single()`],
    ['dentro de un comentario', `// antes: .eq('owner_id', user.id).single()\n/* .eq('owner_id', x).single() */`],
  ])('da negativo: %s', (_label, src) => {
    expect(usaSingleTrasOwnerId(src)).toBe(false)
  })
})

/** El barrido de los gates de resolución: el panel, `/` y las rutas de app/api (quick 261124-ubl). */
function archivosDelPanel(): string[] {
  const raiz = process.cwd()
  return [
    ...fuentesDe(join(raiz, 'app', '(dashboard)')),
    ...fuentesDe(join(raiz, 'app', 'api')),
    join(raiz, 'app', 'page.tsx'),
  ]
}

describe('el panel no resuelve el negocio con `.eq(owner_id).single()` (quick 261124-neg, 261124-ubl)', () => {
  const archivos = archivosDelPanel()
  const rutas = archivos.map(rutaPosix)
  const fuente = new Map(archivos.map((abs) => [rutaPosix(abs), read(abs)]))

  it('el barrido ve los archivos esperados y cada uno usa el helper', () => {
    expect(rutas.length, 'el barrido no encontró NADA: está roto, no es que el panel esté limpio').toBeGreaterThan(0)
    for (const esperado of ESPERADOS) expect(rutas, `el barrido ya no ve ${esperado}`).toContain(esperado)
    // Se junta la lista entera (no corta en el primero) para que el rojo nombre a todos los que faltan.
    const sinHelper = ESPERADOS.filter((r) => !/\bnegocioDel(?:Dueno|Panel)\(/.test(sinComentariosLexico(fuente.get(r)!)))
    expect(sinHelper, `Archivos que no resuelven el negocio con negocioDelDueno/negocioDelPanel.\n${PORQUE}`).toEqual([])
  })

  it('ningún archivo vuelve a `.eq(owner_id).single()`', () => {
    const reincidentes = rutas.filter((r) => !(r in EXCEPCIONES) && usaSingleTrasOwnerId(fuente.get(r)!))
    expect(reincidentes, `Archivos con \`.eq('owner_id', …).single()\`.\n${PORQUE}`).toEqual([])
  })

  it('las excepciones siguen vigentes', () => {
    for (const ruta of Object.keys(EXCEPCIONES)) {
      expect(rutas, `la excepción ${ruta} ya no existe: sacala de EXCEPCIONES`).toContain(ruta)
      expect(
        usaSingleTrasOwnerId(fuente.get(ruta)!),
        `${ruta} ya no usa el patrón: sacala de EXCEPCIONES para que el gate la vuelva a cubrir`,
      ).toBe(true)
    }
  })
})

// ── Quick 261124-ubl — gate B: ninguna mutación sobre `businesses` filtra sólo por `owner_id` ─────────
//
// EL BUG QUE ESTE GATE IMPIDE QUE VUELVA. `app/api/mercadopago/disconnect/route.ts` hacía
// `.from('businesses').update({ mp_user_id: null }).eq('owner_id', user.id)`. `owner_id` no es unique:
// a un dueño con dos negocios, «desconectar MercadoPago» le desconectaba LOS DOS, aunque el panel le
// muestra uno solo. Lo mismo vale para cualquier `.update/.delete/.upsert` sobre `businesses`.
//
// EL ARREGLO que congela: la mutación se acota por el `id` del negocio resuelto con `negocioDelDueno`,
// y `owner_id` queda como defensa en profundidad (molde: app/api/mercadopago/callback/route.ts).
//
// POR QUÉ UN ESCÁNER Y NO UNA REGEX DE UNA LÍNEA (DC-7). Los payloads llevan paréntesis anidados
// (`.update({ mp_user_id: String(x) })`). Una regex corta se trunca en el primer `)`: termina en rojo con
// el código correcto, o en verde midiendo cero (trampa ya vista en este repo). `cadenasSobreBusinesses`
// recorre la cadena con paréntesis balanceados y saltea los strings; los fixtures y las anclas sobre
// archivos reales prueban que mide algo.
//
// LÍMITE CONOCIDO: una cadena armada en varias sentencias (`let q = sb.from('businesses').update(…);
// q = q.eq('owner_id', …)`) no se detecta: el escáner sólo sigue una cadena de llamadas contigua.

/** Saltea un literal de string que empieza en `i` (comilla simple, doble o backtick). Devuelve el índice siguiente. */
function saltarString(src: string, i: number): number {
  const comilla = src[i]
  let j = i + 1
  while (j < src.length) {
    if (src[j] === '\\') { j += 2; continue }
    if (src[j] === comilla) return j + 1
    j++
  }
  return j
}

/** Desde un `(` en `i`, avanza hasta su `)` balanceado (salteando strings). Devuelve el índice siguiente, o -1. */
function saltarParentesis(src: string, i: number): number {
  let prof = 0
  let j = i
  while (j < src.length) {
    const c = src[j]
    if (c === "'" || c === '"' || c === '`') { j = saltarString(src, j); continue }
    if (c === '(') prof++
    else if (c === ')') {
      prof--
      if (prof === 0) return j + 1
    }
    j++
  }
  return -1
}

/** Desde un `<` en `i`, avanza hasta su `>` balanceado (genérico de TS). Devuelve el índice siguiente, o -1. */
function saltarGenerico(src: string, i: number): number {
  let prof = 0
  let j = i
  while (j < src.length) {
    const c = src[j]
    if (c === "'" || c === '"' || c === '`') { j = saltarString(src, j); continue }
    if (c === '<') prof++
    else if (c === '>') {
      prof--
      if (prof === 0) return j + 1
    }
    else if (c === ';') return -1 // un `<` que no era genérico: corta antes de comerse la sentencia siguiente
    j++
  }
  return -1
}

/**
 * Borra comentarios de línea y de bloque en UNA pasada, sabiendo si está dentro de un string. Hace falta
 * porque `sinComentarios` (de arriba) aplica primero la regex de bloque: un `/*` dentro de un comentario
 * de línea (`// los endpoints /api/google/* …`, medido en settings-client.tsx) abre un «bloque» que se
 * come cientos de líneas de código hasta el próximo `*\/`, y el escáner deja de ver esas cadenas
 * (verde midiendo de menos). Un string con comilla simple o doble termina en el salto de línea aunque no
 * cierre: así un apóstrofo suelto en texto JSX desordena, como mucho, una línea.
 */
function sinComentariosLexico(src: string): string {
  let out = ''
  let i = 0
  while (i < src.length) {
    const c = src[i]
    const d = src[i + 1]
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue }
        if (src[j] === c) { j++; break }
        if (src[j] === '\n' && c !== '`') break
        j++
      }
      out += src.slice(i, j)
      i = j
    } else if (c === '/' && d === '/') {
      while (i < src.length && src[i] !== '\n') i++
    } else if (c === '/' && d === '*') {
      const fin = src.indexOf('*/', i + 2)
      i = fin < 0 ? src.length : fin + 2
    } else {
      out += c
      i++
    }
  }
  return out
}

const FROM_BUSINESSES = /\.from\(\s*(['"`])businesses\1\s*\)/g
const ESPACIO = /\s/

/**
 * Cada cadena de llamadas que arranca en `.from('businesses')` (cualquier comilla), completa: desde el
 * `.from(` hasta la última `.metodo(<args>)` contigua. Se aplica sobre el fuente YA sin comentarios
 * (`sinComentariosLexico`).
 */
function cadenasSobreBusinesses(src: string): string[] {
  const cadenas: string[] = []
  for (const m of src.matchAll(FROM_BUSINESSES)) {
    const inicio = m.index!
    let pos = inicio + m[0].length
    for (;;) {
      let j = pos
      while (j < src.length && ESPACIO.test(src[j])) j++
      if (src[j] !== '.') break
      j++
      const id = /^[A-Za-z_$][\w$]*/.exec(src.slice(j))
      if (!id) break
      j += id[0].length
      while (j < src.length && ESPACIO.test(src[j])) j++
      if (src[j] === '<') {
        const fin = saltarGenerico(src, j)
        if (fin < 0) break
        j = fin
        while (j < src.length && ESPACIO.test(src[j])) j++
      }
      if (src[j] !== '(') break
      const fin = saltarParentesis(src, j)
      if (fin < 0) break
      pos = fin
    }
    cadenas.push(src.slice(inicio, pos))
  }
  return cadenas
}

/** `.eq('owner_id', …)` (cualquier comilla) o `.match({ … owner_id … })`. */
const filtraPorOwner = (c: string) =>
  /\.eq\(\s*(['"`])owner_id\1/.test(c) || /\.match\(\s*\{[^}]*\bowner_id\b/.test(c)
/** `.eq('id', …)` (cualquier comilla). */
const filtraPorId = (c: string) => /\.eq\(\s*(['"`])id\1\s*,/.test(c)
/** La cadena escribe: `.update(`, `.delete(` o `.upsert(`. */
const esMutacion = (c: string) => /\.(?:update|delete|upsert)\s*\(/.test(c)

/** El fuente tiene una mutación sobre `businesses` filtrada por `owner_id` sin `id`. */
function mutaPorOwnerSinId(src: string): boolean {
  return cadenasSobreBusinesses(sinComentariosLexico(src)).some((c) => esMutacion(c) && filtraPorOwner(c) && !filtraPorId(c))
}

const PORQUE_MUTACION = [
  'RIESGO: un UPDATE/DELETE/UPSERT sobre `businesses` filtrado sólo por `owner_id` toca TODOS los',
  'negocios del dueño (owner_id no es unique): a un dueño con dos negocios le cambia los dos, aunque el',
  'panel le muestra uno solo.',
  'ARREGLO: acotalo por el negocio resuelto con `negocioDelDueno` —`.eq(\'id\', <negocio>.id)`— y dejá',
  '`.eq(\'owner_id\', user.id)` como defensa en profundidad (molde: app/api/mercadopago/callback/route.ts).',
].join('\n')

describe('escáner de cadenas sobre `businesses` (fixtures, quick 261124-ubl)', () => {
  it.each([
    [
      'el disconnect viejo, multilínea',
      `const { error: bizErr } = await supabase
    .from('businesses')
    .update({ mp_user_id: null })
    .eq('owner_id', user.id)`,
    ],
    [
      'payload con paréntesis anidados + select',
      `await sb.from('businesses').update({ a: String(a), b: f(g(1)), c: ')' }).eq('owner_id', uid).select('id')`,
    ],
    ['delete por owner_id', `await sb.from('businesses').delete().eq('owner_id', uid)`],
    ['update con match', `await sb.from('businesses').update({ x: 1 }).match({ owner_id: uid })`],
    ['comillas dobles', `await sb.from("businesses").update({ x: 1 }).eq("owner_id", uid)`],
    [
      'después de un comentario de línea con /* adentro',
      `// los endpoints /api/google/* comparten esto
const a = 1
await sb.from('businesses').delete().eq('owner_id', uid)
/* fin */`,
    ],
  ])('da positivo: %s', (_label, src) => {
    expect(mutaPorOwnerSinId(src)).toBe(true)
  })

  it.each([
    [
      'el update del callback de MP (id + owner_id)',
      `await supabase
    .from('businesses')
    .update({
      mp_user_id: tokens.user_id != null ? String(tokens.user_id) : null,
      mp_connection_status: 'connected',
    })
    .eq('id', biz.id)
    .eq('owner_id', user.id)`,
    ],
    ['update por id solo', `await sb.from('businesses').update({ x: 1 }).eq('id', business.id)`],
    [
      'upsert de business_secrets',
      `await sb.from('business_secrets').upsert({ business_id: biz.id, mp_access_token: null }, { onConflict: 'business_id' }).eq('owner_id', uid)`,
    ],
    ['otra tabla por owner_id', `await sb.from('clients').update({ x: 1 }).eq('owner_id', uid)`],
    [
      'una lectura (no es mutación)',
      `await sb.from('businesses').select(c).eq('owner_id', id).order('created_at', { ascending: true }).limit(1).maybeSingle()`,
    ],
    [
      'la cadena vieja dentro de un comentario',
      `// .from('businesses').update({ mp_user_id: null }).eq('owner_id', user.id)\n/* .from('businesses').delete().eq('owner_id', x) */`,
    ],
  ])('da negativo: %s', (_label, src) => {
    expect(mutaPorOwnerSinId(src)).toBe(false)
  })

  it('devuelve la cadena entera, sin truncarse en los paréntesis del payload', () => {
    const [c] = cadenasSobreBusinesses(`sb.from('businesses').update({ a: String(x) }).eq('id', b.id).eq('owner_id', u)`)
    expect(c).toBe(`.from('businesses').update({ a: String(x) }).eq('id', b.id).eq('owner_id', u)`)
  })
})

describe('anclas del escáner contra el código real (para que el barrido no mida cero)', () => {
  const cadenasDe = (rel: string) => cadenasSobreBusinesses(sinComentariosLexico(read(rel)))

  it('el callback de MP tiene una mutación con id y owner_id', () => {
    const muts = cadenasDe('app/api/mercadopago/callback/route.ts').filter(esMutacion)
    expect(muts.length).toBeGreaterThanOrEqual(1)
    expect(muts.some((c) => filtraPorId(c) && filtraPorOwner(c))).toBe(true)
  })

  it('_landing-actions.ts tiene exactamente 3 mutaciones', () => {
    expect(cadenasDe('app/(dashboard)/web/_landing-actions.ts').filter(esMutacion)).toHaveLength(3)
  })

  it('subscription/create tiene al menos una mutación', () => {
    expect(cadenasDe('app/api/subscription/create/route.ts').filter(esMutacion).length).toBeGreaterThanOrEqual(1)
  })

  // Son 12 `.from('businesses')`, todos updates. Con `sinComentarios` el escáner veía 8: el `/*` del
  // comentario de línea «/api/google/*» se comía el resto del archivo.
  it('settings-client tiene al menos 10 mutaciones', () => {
    expect(cadenasDe('app/(dashboard)/settings/settings-client.tsx').filter(esMutacion).length).toBeGreaterThanOrEqual(10)
  })

  it('el helper tiene una lectura por owner_id', () => {
    const lecturas = cadenasDe('lib/negocio-del-dueno.ts').filter((c) => !esMutacion(c) && filtraPorOwner(c))
    expect(lecturas.length).toBeGreaterThanOrEqual(1)
  })
})

describe('ninguna mutación sobre `businesses` filtra por owner_id sin id (quick 261124-ubl)', () => {
  const raiz = process.cwd()
  const archivos = ['app', 'lib', 'components', 'scripts'].flatMap((d) => fuentesDe(join(raiz, d)))
  const rutas = archivos.map(rutaPosix)

  it('el barrido ve app/, lib/, components/ y scripts/', () => {
    for (const d of ['app/', 'lib/', 'components/', 'scripts/']) {
      expect(rutas.some((r) => r.startsWith(d)), `el barrido no ve nada bajo ${d}`).toBe(true)
    }
  })

  it('mutación sobre businesses por owner_id sin id', () => {
    const reincidentes = archivos.filter((abs) => mutaPorOwnerSinId(read(abs))).map(rutaPosix)
    expect(reincidentes, `Mutaciones sobre \`businesses\` filtradas sólo por owner_id.\n${PORQUE_MUTACION}`).toEqual([])
  })
})

// ── Quick 261124-ubl — gate A de lectura: nadie resuelve el negocio por owner_id fuera del helper ─────
//
// El chequeo del single de arriba no ve una resolución propia con `maybeSingle`, `limit` o un array. Ésta
// mira cualquier cadena de LECTURA sobre `businesses` filtrada por `owner_id` sin `id`: si no pasa por
// `negocioDelDueno`, puede elegir un negocio distinto del que muestra el panel (o romperse con dos).

/** Rutas que pueden seguir leyendo `businesses` por owner_id, con motivo y vigencia. Sumar una es una DECISIÓN. */
const EXCEPCIONES_LECTURA: Record<string, string> = {
  'app/api/abonos/cancel-link/[id]/route.ts':
    'DC-6 (261124-ubl): ya elige el más viejo (order created_at + order id + limit(2)) y loguea el caso de ' +
    '2+ negocios (WR-B1/B2). Migrarlo al helper perdería ese log. Vigencia: mientras conserve esa cadena.',
  'app/(dashboard)/web/_landing-actions.ts': 'temporal: se migra en la Task 3 de 261124-ubl.',
}

describe('nadie lee `businesses` por owner_id sin id fuera del helper (quick 261124-ubl)', () => {
  const archivos = archivosDelPanel()
  const rutas = archivos.map(rutaPosix)
  const fuente = new Map(archivos.map((abs) => [rutaPosix(abs), read(abs)]))
  const lecturasPorOwner = (src: string) =>
    cadenasSobreBusinesses(sinComentariosLexico(src)).filter((c) => !esMutacion(c) && filtraPorOwner(c) && !filtraPorId(c))

  it('ninguna lectura propia por owner_id', () => {
    const reincidentes = rutas.filter((r) => !(r in EXCEPCIONES_LECTURA) && lecturasPorOwner(fuente.get(r)!).length > 0)
    expect(
      reincidentes,
      `Archivos que leen \`businesses\` por owner_id sin id, fuera de negocioDelDueno.
${PORQUE}`,
    ).toEqual([])
  })

  it('las excepciones de lectura siguen vigentes', () => {
    for (const ruta of Object.keys(EXCEPCIONES_LECTURA)) {
      expect(rutas, `la excepción ${ruta} ya no existe: sacala de EXCEPCIONES_LECTURA`).toContain(ruta)
      expect(
        lecturasPorOwner(fuente.get(ruta)!).length,
        `${ruta} ya no lee por owner_id: sacala de EXCEPCIONES_LECTURA para que el gate la vuelva a cubrir`,
      ).toBeGreaterThan(0)
    }
    // cancel-link: la vigencia es la cadena concreta (orden de alta + limit(2)), no cualquier lectura.
    const cancelLink = lecturasPorOwner(fuente.get('app/api/abonos/cancel-link/[id]/route.ts')!)
    expect(
      cancelLink.some((c) => /\.order\(\s*'created_at'/.test(c) && /\.limit\(\s*2\s*\)/.test(c)),
      'cancel-link ya no elige el más viejo con order created_at + limit(2): revisá la excepción DC-6',
    ).toBe(true)
  })
})
