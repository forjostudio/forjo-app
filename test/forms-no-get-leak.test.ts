import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

// ── Quick 261006-mx6 — ningún formulario del repo puede filtrar sus campos por la URL ────────────
//
// EL BUG QUE ESTE GATE IMPIDE QUE VUELVA (apareció en PRODUCCIÓN, reproducido dos veces y sin
// buscarlo, mirando el historial del navegador):
//
//     /login?email=test%40forjo.local&password=Forjo1234%21
//
// MECANISMO. Los formularios de este repo se envían por JS (`onSubmit={handleSubmit(...)}`), pero
// `onSubmit` sólo existe DESPUÉS de que React hidrata. En la ventana previa a la hidratación —más
// ancha en mobile y con red lenta, que es justo donde vive el login mobile— un tap en el botón
// dispara el submit NATIVO del navegador. Si la etiqueta no declara `method`, el default del HTML es
// GET: el navegador serializa TODOS los campos en el query string.
//
// POR QUÉ IMPORTA MÁS DE LO QUE PARECE: los bodies de POST no se loguean en ninguna parte; las URLs
// sí — historial del navegador y logs de acceso del server, del proxy y del CDN. Una contraseña (o el
// teléfono y el mail de un tercero, en el alta de cliente) que entra ahí queda escrita en disco en
// infraestructura que nadie audita.
//
// EL ARREGLO que este gate congela: `method="post"` en cada formulario. Post-hidratación es inerte
// (`handleSubmit` hace `preventDefault()`); pre-hidratación convierte la fuga en un POST a la URL
// actual, que devuelve 200 y simplemente vuelve a mostrar la pantalla. Medido contra el dev server.
//
// SUITE PURA: no importa nada de './env' ni ningún cliente de datos, así que el clasificador de
// test/suite-split.ts la manda al carril paralelo `pure`. Molde: test/catalog-public.test.ts.
//
// POR QUÉ LEE EL FUENTE EN VEZ DE RENDERIZAR: el environment de Vitest acá es `node` (no hay DOM, no
// hay Testing Library) y el milestone prohíbe agregar paquetes. El atributo que cierra la fuga vive
// en el MARKUP, así que el markup es lo que se afirma. Mismo mecanismo que shell-scope.test.ts.

const read = (rel: string) => readFileSync(rel, 'utf8')

/**
 * La marca de la etiqueta, armada por CONCATENACIÓN para que este archivo no se matchee a sí mismo en
 * el barrido de todas las fuentes del repo (mismo truco que la MARCA de shell-scope.test.ts y la
 * LLAMADA de catalog-public.test.ts). Si alguien escribe la etiqueta literal en un string de acá, el
 * gate empieza a denunciarse solo.
 */
const MARCA = '<' + 'form'

/**
 * Borra comentarios JSX, de bloque y de línea, en ese orden. Copiado de catalog-public.test.ts:35.
 *
 * ES LO QUE HACE HONESTO A ESTE GATE, y está COMPROBADO: sin esto el barrido denuncia
 * `app/[slug]/booking-client.tsx`, `components/ui/time-field.tsx` y `components/landing/gallery.tsx`,
 * cuyas únicas menciones a la etiqueta están DENTRO de comentarios —el primero dice explícitamente
 * que esa pantalla no tiene formulario—. Tres falsos positivos que convertirían este gate en ruido,
 * y el ruido termina en que alguien lo desactiva.
 */
function sinComentarios(src: string): string {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/**
 * Todos los .ts/.tsx del repo (excluidas dependencias, artefactos de build y directorios ocultos).
 * Es el `grep -rln` del audit llevado a test: sin él, "ningún formulario filtra por la URL" sería una
 * afirmación sobre los archivos que a alguien se le ocurrió mirar, no un invariante del repo.
 * Copiado de catalog-public.test.ts:48.
 */
function fuentesDelRepo(dir = process.cwd(), acc: string[] = []): string[] {
  const IGNORAR = new Set(['node_modules', 'coverage', 'supabase', 'public'])
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || IGNORAR.has(e.name)) continue
    const full = join(dir, e.name)
    if (e.isDirectory()) fuentesDelRepo(full, acc)
    else if (/\.tsx?$/.test(e.name)) acc.push(full)
  }
  return acc
}

/** Ruta relativa en POSIX: en Windows `relative()` devuelve `\`, y las rutas esperadas van con `/`. */
function rutaPosix(abs: string): string {
  return relative(process.cwd(), abs).split(sep).join('/')
}

/**
 * Recorta la etiqueta de APERTURA desde la marca de `desde` hasta su `>`.
 *
 * No se puede hacer con un `[^>]*>`: los atributos JSX llevan expresiones entre llaves y una flecha
 * (`onSubmit={(e) => ...}`) mete un `>` que cortaría la etiqueta por la mitad y esconderia los
 * atributos que vienen después — incluido el `method` que este gate exige. Por eso se balancean las
 * llaves y se ignoran los `>` que caen dentro de un string.
 */
function etiquetaDeApertura(src: string, desde: number): string {
  let llaves = 0
  let comilla: string | null = null
  for (let i = desde; i < src.length; i++) {
    const c = src[i]
    if (comilla) {
      if (c === comilla) comilla = null
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      comilla = c
      continue
    }
    if (c === '{') llaves++
    else if (c === '}') llaves--
    else if (c === '>' && llaves === 0) return src.slice(desde, i + 1)
  }
  return src.slice(desde)
}

interface Formulario {
  archivo: string
  etiqueta: string
}

/** Todas las etiquetas de apertura de formulario del repo, ya sin comentarios. */
function formulariosDelRepo(): Formulario[] {
  const encontrados: Formulario[] = []
  for (const abs of fuentesDelRepo()) {
    const limpio = sinComentarios(read(abs))
    let i = limpio.indexOf(MARCA)
    while (i !== -1) {
      // El nombre de la etiqueta tiene que TERMINAR en la marca: así un componente que empiece igual
      // (`<formGroup`, `<formulario`) no se cuenta como formulario HTML.
      const siguiente = limpio[i + MARCA.length] ?? ''
      if (siguiente === '>' || siguiente === '/' || /\s/.test(siguiente)) {
        encontrados.push({ archivo: rutaPosix(abs), etiqueta: etiquetaDeApertura(limpio, i) })
      }
      i = limpio.indexOf(MARCA, i + MARCA.length)
    }
  }
  return encontrados
}

/** Valor literal del atributo `method`, o `null` si no está declarado (o si es una expresión). */
function methodDeclarado(etiqueta: string): string | null {
  const m = /\bmethod\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(etiqueta)
  return m ? (m[1] ?? m[2]).trim().toLowerCase() : null
}

/**
 * Formularios que SÍ pueden declarar `method="get"`: los que no llevan ningún dato sensible (un
 * buscador, donde los términos en la URL son la feature). Hoy está vacía a propósito — el repo no
 * tiene ninguno. Sumar una ruta acá es una DECISIÓN explícita, no un descuido: hay que mirar campo
 * por campo que ninguno sea una credencial ni un dato personal.
 */
const GET_PERMITIDO: string[] = []

/**
 * Los 6 formularios medidos en el quick 261006-mx6. Esta lista es la GUARDA DE "NO ENCONTRÓ NADA":
 * un barrido que no matchea ninguna etiqueta pasaría por vacío y el gate quedaría decorativo (es la
 * regla que el repo ya aplica en sus otros gates). Si uno de estos archivos se renombra o se borra,
 * el gate falla y obliga a actualizar la lista a mano en vez de adelgazar en silencio.
 */
const ESPERADOS = [
  'app/(auth)/(split)/forgot-password/page.tsx',
  'app/(auth)/(split)/login/page.tsx',
  'app/(auth)/(split)/reset-password/page.tsx',
  'app/(auth)/register/page.tsx',
  'app/(dashboard)/clients/clients-client.tsx',
  'components/auth/mobile-login-hero.tsx',
]

/** El PORQUÉ, en el mensaje de fallo: el que lo lea dentro de un año tiene que ver el riesgo, no un "falta method". */
const PORQUE = [
  'RIESGO: un formulario sin `method` se envía por GET si el usuario lo dispara ANTES de que React',
  'hidrate (el `onSubmit` todavía no existe) y el navegador serializa TODOS sus campos en el QUERY',
  'STRING. Esa URL queda escrita en el historial del navegador y en los logs de acceso del server,',
  'del proxy y del CDN, que loguean URLs pero NO bodies. Ya pasó en producción con la contraseña del',
  'login (/login?email=...&password=...), reproducido dos veces sin buscarlo.',
  'ARREGLO: agregale `method="post"` a la etiqueta. Post-hidratación queda inerte porque',
  '`handleSubmit` hace `preventDefault()`; pre-hidratación manda los campos en el CUERPO de un POST a',
  'la URL actual (medido: 200, el usuario simplemente vuelve a ver la pantalla). NO agregues `action`:',
  'sin él el submit nativo va a la URL actual, que es exactamente lo que se midió.',
].join('\n')

describe('ningún formulario filtra sus campos por la URL (quick 261006-mx6)', () => {
  const todos = formulariosDelRepo()

  it('el barrido encuentra los formularios que ya sabemos que existen', () => {
    // Sin esta aserción, cualquier bug del barrido (la marca mal escrita, un `sinComentarios` que se
    // coma el markup, un walker que no entre a `app/`) dejaría pasar el gate por vacío.
    expect(
      todos.length,
      'el barrido no encontró NINGÚN formulario: está roto, no es que el repo esté limpio'
    ).toBeGreaterThan(0)

    const archivos = [...new Set(todos.map((f) => f.archivo))].sort()
    for (const esperado of ESPERADOS) {
      expect(archivos, `el barrido ya no ve el formulario de ${esperado}`).toContain(esperado)
    }
  })

  it('todos declaran `method` explícito', () => {
    const sinMethod = todos
      .filter((f) => methodDeclarado(f.etiqueta) === null)
      .map((f) => `${f.archivo}: ${f.etiqueta.replace(/\s+/g, ' ')}`)

    expect(sinMethod, `Formularios sin \`method\` declarado.\n${PORQUE}`).toEqual([])
  })

  it('ninguno manda sus campos por GET', () => {
    const porGet = todos
      .filter((f) => methodDeclarado(f.etiqueta) === 'get' && !GET_PERMITIDO.includes(f.archivo))
      .map((f) => f.archivo)

    expect(
      porGet,
      'Formularios con `method="get"`: ahí los campos viajan en la URL SIEMPRE, no sólo antes de\n' +
        `hidratar.\n${PORQUE}\nSi el formulario no tiene credenciales ni datos personales y el GET es\n` +
        'intencional, sumalo a GET_PERMITIDO en este archivo y dejá dicho por qué.'
    ).toEqual([])
  })
})
