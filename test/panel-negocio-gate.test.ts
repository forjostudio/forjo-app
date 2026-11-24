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

function usaSingleTrasOwnerId(src: string): boolean {
  return OWNER_ID_SINGLE.test(sinComentarios(src))
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
  '`@/lib/negocio-del-dueno`; donde haga falta otra política, `negocioDelDueno` (discriminado).',
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

describe('el panel no resuelve el negocio con `.eq(owner_id).single()` (quick 261124-neg)', () => {
  const archivos = [...fuentesDe(join(process.cwd(), 'app', '(dashboard)')), join(process.cwd(), 'app', 'page.tsx')]
  const rutas = archivos.map(rutaPosix)
  const fuente = new Map(archivos.map((abs) => [rutaPosix(abs), read(abs)]))

  it('el barrido ve los 16 archivos y cada uno usa el helper', () => {
    expect(rutas.length, 'el barrido no encontró NADA: está roto, no es que el panel esté limpio').toBeGreaterThan(0)
    for (const esperado of ESPERADOS) {
      expect(rutas, `el barrido ya no ve ${esperado}`).toContain(esperado)
      expect(
        /\bnegocioDel(?:Dueno|Panel)\(/.test(sinComentarios(fuente.get(esperado)!)),
        `${esperado} no resuelve el negocio con negocioDelDueno/negocioDelPanel`,
      ).toBe(true)
    }
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
