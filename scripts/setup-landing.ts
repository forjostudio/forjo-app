// Escritor service-role local de la skill `forjo-web-builder` (Phase 10 · web-builder, SKILL-01/03/04).
//
// POR QUÉ es un script local y NO un endpoint web (D10-01 / SKILL-04):
// la escritura del landing toca una fila REAL de producción (`businesses.landing_config`) y sube
// objetos a un bucket público con service-role (bypassa RLS). Ese poder NO puede vivir en el runtime
// web: un endpoint, por más protegido que esté, es superficie de ataque y de error humano. Mismo
// razonamiento de seguridad que `scripts/setup-admin.ts`: corre en Node FUERA del runtime web, con el
// service-role del entorno, sin auth porque no la necesita (la frontera es la máquina del operador).
//
// QUÉ hace — DOS modos:
//   · `--inspect <slug>`  → READ-ONLY. Imprime un resumen del negocio (id, nombre, vertical, tema
//     actual, servicios activos) y las DOS columnas del landing por separado: `al_aire`
//     (`landing_config` — lo que ve cualquier visitante) y `pendiente_de_aprobacion`
//     (`landing_draft` — lo que ve el dueño en su editor y todavía NO salió al aire), más el flag de
//     cambios sin publicar (SKILL-08 / D-05). NO sube nada, NO hace UPDATE. Es el insumo que el
//     SKILL.md muestra en el checkpoint humano antes de aprobar la escritura (research Q2).
//   · ESCRITURA → recibe el slug y un payload JSON (`--config <path>`): la materia prima del config
//     (un BuilderInput de lib/landing/builder.ts) con las imágenes como RUTAS LOCALES, más brand hints.
//     Resuelve slug→business_id, AVISA si el dueño tiene cambios sin publicar (D-01/D-02), sube cada
//     imagen local re-encodeada con sharp a `landing-assets/{businessId}/{sha256}.{ext}` (key derivada
//     del CONTENIDO → re-correr el mismo payload da las MISMAS URLs: la escritura es idempotente),
//     reemplaza las rutas por URLs públicas de Storage, arma el config con buildLandingConfig + recommendTheme, lo
//     VALIDA con el gate ESTRICTO de escritura (`parseLandingConfigForWrite` — reject-on-invalid) y
//     recién entonces hace `UPDATE ... WHERE id = businessId` (por id, NO por slug).
//
//     ⚠ POR DEFECTO ESCRIBE SOLO EL BORRADOR (`landing_draft`) — Phase 16 / SKILL-07. La web que arma
//     el operador NACE COMO BORRADOR y NO aparece en `/[slug]`: espera a que el dueño la mire y la
//     publique desde su panel. Publicar es OPT-IN EXPLÍCITO con `--publish`, que escribe las DOS
//     columnas con el mismo objeto validado (D-03/D-03b) e imprime antes qué web está por reemplazar.
//
// POR QUÉ el payload llega por archivo JSON (`--config <path>`) y no por arg inline:
//   PowerShell pelea con el quoting de JSON en la CLI; un archivo temporal evita ese infierno y deja
//   el flujo del SKILL.md trivial (escribe un .json, llama al script con su ruta).
//
// USO (local, con .env.local cargado):
//   npm run setup:landing -- --inspect <slug>                                    (read-only)
//   npm run setup:landing -- --slug <slug> --config <ruta.json>                  (escribe el BORRADOR)
//   npm run setup:landing -- --slug <slug> --config <ruta.json> --publish        (borrador + AL AIRE)
//
// Cero deps npm nuevas: tsx/dotenv/@supabase/supabase-js/sharp/zod ya están (RESEARCH §Package Audit).

import { config as loadEnv } from 'dotenv'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import sharp from 'sharp'

import { buildLandingConfig, recommendTheme } from '@/lib/landing/builder'
import type { BuilderInput, BrandHints } from '@/lib/landing/builder'
// parseLandingConfig es el validador FAIL-SAFE de LECTURA: acá se importa SOLO para el camino de
// lectura (readLandingState, que compara las dos columnas). El write path usa el ESTRICTO de
// @/lib/landing/write — ver el GATE de runWrite.
// `landingConfigSchema` (el z.object crudo) se importa SOLO para distinguir "columna presente pero
// ROTA" de "columna ausente": `parseLandingConfig` tapa esa diferencia devolviendo el DEFAULT (ver
// readLandingState). No se usa para escribir — el write path tiene su propio gate estricto.
import { parseLandingConfig, landingConfigSchema } from '@/lib/landing/schema'
import type { LandingConfig } from '@/lib/landing/schema'
import { parseLandingConfigForWrite, landingWriteColumns } from '@/lib/landing/write'
import { diffConfigParts } from '@/lib/landing/editor-draft'
import type { ConfigPart } from '@/lib/landing/editor-draft'

// Vitest/Next cargan .env.local solos; un script suelto bajo tsx NO. Lo cargamos con dotenv
// (igual que scripts/setup-admin.ts — cero deps nuevas) para tener el service-role en el entorno.
loadEnv({ path: '.env.local' })

const BUCKET = 'landing-assets'

// Tamaños sensatos por rol de imagen (ancho máx en px). Hero a 1600 (también sirve el OG 1200x630);
// gallery a 1080; about a 960. sharp redimensiona sin agrandar (withoutEnlargement).
const ROLE_WIDTH: Record<string, number> = { hero: 1600, gallery: 1080, about: 960 }

// ── Tipos del payload de escritura ────────────────────────────────────────────────
// El SKILL.md arma este JSON: un BuilderInput con las imágenes como RUTAS LOCALES (lo que el script
// debe re-hostear) + las pistas de marca para recommendTheme. `image`/`images[]` acá son paths del
// disco, NO URLs; el script los reemplaza por URLs públicas de Storage antes de llamar al builder.
interface WritePayload {
  input: BuilderInput // materia prima del config (con rutas locales en image/images[])
  brand?: BrandHints // pistas de marca para el tema (vertical, primary_color, theme, palette, font)
}

// ── Helpers de args (sin libs, como setup-admin lee process.argv) ───────────────────
// Lee un flag `--nombre <valor>`; devuelve undefined si no está. Soporta `--nombre=valor` también.
function getFlag(name: string): string | undefined {
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === `--${name}`) return argv[i + 1]
    if (a.startsWith(`--${name}=`)) return a.slice(name.length + 3)
  }
  return undefined
}

// Lee un flag BOOLEANO `--nombre`: true si el token EXACTO está en argv, false si no.
// POR QUÉ no alcanza getFlag('publish'): getFlag devuelve el argv SIGUIENTE al flag, así que
// `--publish --slug x` daría `'--slug'` (truthy por accidente) y `--publish` suelto al final daría
// `undefined` (falsy, justo cuando el operador SÍ lo pidió). Un flag booleano se pregunta por
// presencia, no por valor.
function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`)
}

// ── Resolución del negocio por slug (compartida por inspect y escritura) ────────────
// Consulta la tabla BASE `businesses` con service-role (bypassa RLS): trae las columnas que el
// resumen/escritura necesitan. Devuelve la fila o null si el slug no existe.
// Trae LAS DOS columnas del landing: `landing_config` (LO PUBLICADO) y `landing_draft` (EL BORRADOR
// que edita el dueño). Hasta la Phase 16 el script escribía `landing_draft` A CIEGAS y nunca la leía
// — de ahí salían el aviso de choque imposible (D-01) y el `--inspect` incompleto (D-05).
async function resolveBusiness(
  supabase: SupabaseClient,
  slug: string,
) {
  const { data, error } = await supabase
    .from('businesses')
    .select(
      'id, name, slug, vertical, theme, palette, font, primary_color, whatsapp, landing_config, landing_draft',
    )
    .eq('slug', slug)
    .maybeSingle()
  if (error) {
    console.error('[setup-landing] error consultando businesses:', error.message)
    process.exitCode = 1
    return null
  }
  return data as {
    id: string
    name: string
    slug: string
    vertical: string | null
    theme: string | null
    palette: string | null
    font: string | null
    primary_color: string | null
    whatsapp: string | null
    landing_config: unknown
    landing_draft: unknown
  } | null
}

// ── readLandingState: el estado del landing derivado de las DOS columnas (D-01/D-02/D-05) ──────────
//
// Deriva, de la fila cruda, lo que consumen el aviso de choque (D-01/D-02) y `--inspect` (D-05).
// NO escribe nada: es lectura pura sobre lo que ya trajo resolveBusiness.
//
// QUÉ VALIDADOR USA Y POR QUÉ: acá va `parseLandingConfig` (@/lib/landing/schema), el validador
// FAIL-SAFE de LECTURA. Es el correcto en este lado: estamos LEYENDO las dos columnas para
// COMPARARLAS, y un config ya roto en la DB no debe tumbar el script (justo ahí es cuando el operador
// más necesita poder inspeccionar y avisar). El validador ESTRICTO (`parseLandingConfigForWrite`) es
// el del WRITE PATH y vive en el gate de runWrite: al ESCRIBIR, degradar en silencio significa
// PERSISTIR la degradación (perder una sección entera sin que nadie se entere). Son dos contratos
// OPUESTOS y no se intercambian — confundirlos en el otro sentido es exactamente el bug que esta fase
// viene a corregir.
//
// ── DESVIACIÓN DECLARADA DE D-01 — leer antes de "simplificar" esto de vuelta a configsEqual ───────
// D-01 dice, textual: "detecta si `landing_draft` ≠ `landing_config` con `configsEqual`". La
// INTENCIÓN se cumple al pie de la letra (avisar cuando el dueño tiene trabajo sin publicar); lo que
// cambia es el MECANISMO: la señal es `diffConfigParts(draft, published).length > 0`, que es
// `configsEqual` aplicado POR PARTE más una normalización previa de AMBOS lados. Por qué es mejor y
// no es opcional:
//   · `buildLandingConfig` OMITE las secciones vacías (emite ~5) y el editor del dueño las
//     MATERIALIZA a las 8 fijas (`enabled:false`) al guardar. Con `configsEqual` crudo, un dueño que
//     solo abrió el editor y guardó SIN cambiar nada visible dispararía el aviso. Un aviso que grita
//     en el caso limpio es un aviso que el operador aprende a IGNORAR — perdería su señal justo en el
//     caso que D-01 quiere cubrir.
//   · D-02 pide QUÉ partes difieren, y `configsEqual` devuelve un booleano: no alcanza.
//
// ── "PRESENTE PERO ROTO" ≠ "AUSENTE" (y no se puede tratar como "igual") ───────────────────────────
// `parseLandingConfig` es fail-safe: ante un valor PRESENTE pero que no valida devuelve
// DEFAULT_LANDING_CONFIG, NO null. Si se lo usa a secas para comparar, las dos columnas rotas colapsan
// al MISMO default ⇒ `diffConfigParts` devuelve `[]` ⇒ "no hay cambios sin publicar" ⇒ NINGÚN aviso, y
// el UPDATE le pisa al dueño un borrador REAL en silencio. Es exactamente el escenario que D-01 existe
// para cubrir, entrando por la puerta de atrás. Idem el pre-print de `--publish`: con `landing_config`
// roto le describiría al operador una web que NO existe en la DB, justo cuando la va a reemplazar.
// Por eso acá se pregunta APARTE, con el schema crudo, si cada columna presente valida — y si no
// valida, NO se compara: SE AVISA. Regla: ante duda, avisar (un aviso de más cuesta un WhatsApp; uno
// de menos cuesta el trabajo del dueño, que no tiene undo).
interface LandingState {
  published: LandingConfig | null
  draft: LandingConfig | null
  publicadoRoto: boolean
  borradorRoto: boolean
  nuncaPublico: boolean
  borradorSinComparar: boolean
  partes: ConfigPart[]
  tieneCambiosSinPublicar: boolean
}

function readLandingState(biz: { landing_config: unknown; landing_draft: unknown }): LandingState {
  // "Roto" = presente en la DB pero el schema NO lo acepta tal cual (lo que `parseLandingConfig` tapa
  // devolviendo el DEFAULT). Un valor ausente (null/undefined) NO es roto: es un negocio sin web.
  const publicadoRoto =
    biz.landing_config != null && !landingConfigSchema.safeParse(biz.landing_config).success
  const borradorRoto =
    biz.landing_draft != null && !landingConfigSchema.safeParse(biz.landing_draft).success

  const published = parseLandingConfig(biz.landing_config)
  const draft = parseLandingConfig(biz.landing_draft)
  const nuncaPublico = published === null

  // Sin borrador → no hay nada pendiente de aprobación, no hay nada que pisar. (Ojo: `draft === null`
  // solo pasa cuando la columna está VACÍA; un borrador roto no cae acá, cae en el branch de abajo.)
  if (draft === null) {
    return {
      published,
      draft,
      publicadoRoto,
      borradorRoto,
      nuncaPublico,
      borradorSinComparar: false,
      partes: [],
      tieneCambiosSinPublicar: false,
    }
  }

  // Alguna de las dos columnas está PRESENTE PERO ROTA → la comparación es IMPOSIBLE (el lado roto es
  // un DEFAULT inventado, no el dato real). No se puede PROBAR que el dueño no tenga trabajo sin
  // publicar ⇒ se avisa. `partes: []` a propósito: no hay diff honesto que mostrar.
  if (borradorRoto || publicadoRoto) {
    return {
      published,
      draft,
      publicadoRoto,
      borradorRoto,
      nuncaPublico,
      borradorSinComparar: false,
      partes: [],
      tieneCambiosSinPublicar: true,
    }
  }

  // Hay borrador pero el negocio NUNCA publicó: no existe contra qué diffear (TODO el borrador está
  // pendiente). Es un caso legítimo, no un error — su `/[slug]` sigue mostrando la reserva simple.
  if (published === null) {
    return {
      published,
      draft,
      publicadoRoto,
      borradorRoto,
      nuncaPublico,
      borradorSinComparar: true,
      partes: [],
      tieneCambiosSinPublicar: true,
    }
  }

  const partes = diffConfigParts(draft, published)
  return {
    published,
    draft,
    publicadoRoto,
    borradorRoto,
    nuncaPublico,
    borradorSinComparar: false,
    partes,
    tieneCambiosSinPublicar: partes.length > 0,
  }
}

// Etiqueta legible de cada parte del config para el operador. Es PRESENTACIÓN: vive acá y no en el
// módulo puro (que devuelve las claves del config, no copy).
function formatPart(p: ConfigPart): string {
  if (p === 'theme') return 'tema'
  if (p === 'motion') return 'movimiento'
  return p // las 8 secciones se imprimen tal cual: hero, about, services, gallery, location, hours, cta, booking
}

// ── EL aviso de choque (D-01/D-02), en UN solo lugar ────────────────────────────────────────────────
// Devuelve la línea a imprimir, o null si no hay nada que avisar. Lo comparten `--inspect` y el write
// path A PROPÓSITO: es EL MISMO dato, y el SKILL.md (paso 6) le pide al operador que copie el aviso
// del `--inspect` al checkpoint humano. Si las dos superficies tuvieran su propio copy, podrían
// divergir — y el operador aprobaría una escritura mirando un aviso que no es el que el script imprime.
//
// AVISA, NO ABORTA (y no se le agrega una confirmación interactiva): el checkpoint bloqueante vive en
// el SKILL.md. Cuando este proceso arranca, la escritura YA está aprobada.
function avisoDeChoque(estado: LandingState, slug: string): string | null {
  if (estado.borradorRoto) {
    return (
      '⚠ El dueño TIENE un borrador en la DB, pero NO lo puedo leer (no valida contra el schema): no ' +
      'puedo decirte si tiene trabajo sin publicar ni qué partes difieren. Si seguís, lo pisás.'
    )
  }
  if (estado.publicadoRoto && estado.tieneCambiosSinPublicar) {
    return (
      '⚠ La web publicada está en la DB, pero NO la puedo leer (no valida contra el schema): no puedo ' +
      'comparar el borrador del dueño contra ella. Si seguís, pisás el borrador.'
    )
  }
  if (estado.tieneCambiosSinPublicar && estado.borradorSinComparar) {
    return (
      '⚠ El dueño tiene un borrador sin publicar (este negocio NUNCA publicó su web: ' +
      `/${slug} sigue mostrando la reserva simple). Si seguís, lo pisás.`
    )
  }
  if (estado.tieneCambiosSinPublicar) {
    return (
      '⚠ El dueño tiene cambios sin publicar. Secciones que difieren de lo publicado: ' +
      `${estado.partes.map(formatPart).join(', ')}. Si seguís, los pisás.`
    )
  }
  return null
}

// ── MODO INSPECT (read-only) ────────────────────────────────────────────────────────
// Imprime el resumen del negocio + servicios activos + estado del landing_config. NO escribe NADA:
// re-correrlo debe dar exactamente el mismo output. Es el insumo del checkpoint humano (research Q2).
async function runInspect(
  supabase: SupabaseClient,
  slug: string,
) {
  const biz = await resolveBusiness(supabase, slug)
  if (!biz) {
    console.error(`[setup-landing] no existe ningún negocio con slug "${slug}".`)
    process.exitCode = 1
    return
  }

  // Servicios ACTIVOS del negocio (la columna de activo es `active`, ver lib/types.ts Service).
  // Solo lectura: nombre para el resumen del checkpoint (la lista real la arma el renderer).
  const { data: services, error: svcErr } = await supabase
    .from('services')
    .select('name')
    .eq('business_id', biz.id)
    .eq('active', true)
    .order('name')
  if (svcErr) {
    console.error('[setup-landing] error consultando services:', svcErr.message)
    process.exitCode = 1
    return
  }
  const serviceNames = (services ?? []).map((s) => (s as { name: string }).name)

  // Estado derivado de las DOS columnas (D-05): qué está al aire, qué está pendiente, y si el dueño
  // tiene trabajo sin publicar. Es el MISMO cálculo que dispara el aviso de choque del write path.
  const estado = readLandingState(biz)

  // Resumen legible (JSON estructurado: fácil de mostrar y de parsear desde el SKILL.md).
  const resumen = {
    id: biz.id,
    nombre: biz.name,
    slug: biz.slug,
    vertical: biz.vertical,
    tema_actual: {
      theme: biz.theme,
      palette: biz.palette,
      font: biz.font,
      primary_color: biz.primary_color,
    },
    whatsapp: biz.whatsapp,
    servicios_activos: serviceNames.length,
    servicios: serviceNames,
    // ── Las DOS columnas del landing, POR SEPARADO y con el nombre de lo que son (D-05 / SKILL-08) ──
    // Se vuelcan los valores CRUDOS de la fila (no los parseados de `estado`): el operador tiene que
    // ver lo que REALMENTE hay en la DB, no una versión degradada por el validador fail-safe.
    //
    // Es también el insumo con el que la skill reconstruye el BuilderInput/brand de una landing SIN
    // payload guardado, sin re-tipear todo el copy a mano (D-04, habilita SC2 de SKILL-05). El modo
    // edición parte SIEMPRE de `pendiente_de_aprobacion` (el borrador es "lo último que se tocó" e
    // incluye los retoques que el dueño no publicó) y cae a `al_aire` solo si no hay borrador.
    //
    // Sigue read-only: acá solo se imprime. Y desde la Phase 16 re-correr la escritura YA NO
    // sobre-escribe lo publicado: por defecto escribe SOLO el borrador (`landing_draft`) y la web al
    // aire queda intacta hasta que el dueño la publique. Únicamente `--publish` reemplaza `al_aire`.
    al_aire: biz.landing_config ?? null, // LO PUBLICADO: lo que ve cualquier visitante en /[slug] ahora
    pendiente_de_aprobacion: biz.landing_draft ?? null, // EL BORRADOR: lo que ve el dueño en su editor
    nunca_publico: estado.nuncaPublico, // true → /[slug] todavía muestra la página de reservas simple
    tiene_cambios_sin_publicar: estado.tieneCambiosSinPublicar,
    partes_sin_publicar: estado.partes.map(formatPart), // [] si no hay nada pendiente o si nunca publicó
    // Columna PRESENTE en la DB que NO valida contra el schema. Si alguna es `true`, el diff de arriba
    // NO es confiable (el lado roto se leyó como un DEFAULT inventado) y por eso se avisa igual.
    publicado_roto: estado.publicadoRoto,
    borrador_roto: estado.borradorRoto,
  }
  console.log('[setup-landing] inspect (read-only) —', slug)
  console.log(JSON.stringify(resumen, null, 2))

  // Renglón humano DEBAJO del JSON: deja obvio el caso "el dueño tiene cambios sin publicar" sin
  // obligar a leer el JSON entero. Es EXACTAMENTE el mismo aviso (misma función) que imprime el write
  // path — el operador lo copia tal cual al checkpoint del SKILL.md (paso 6).
  const aviso = avisoDeChoque(estado, slug)
  if (aviso) {
    console.log(aviso)
  } else if (estado.nuncaPublico) {
    console.log('· Este negocio no tiene web: ni publicada ni en borrador.')
  } else if (estado.draft === null) {
    // NO es "coinciden": es que NO HAY borrador. El dueño publicó y nunca volvió a abrir su editor.
    // Decir "coinciden" acá sería afirmar algo falso sobre la fila, justo en el insumo del checkpoint.
    console.log('· No hay borrador: el dueño nunca abrió su editor. Al aire está la web publicada.')
  } else {
    console.log('✓ Borrador y publicado coinciden: no hay nada pendiente de aprobación.')
  }
}

// ── Pipeline de imágenes: descarga/lee → re-encode sharp → upload service-role ──────
// Lee un archivo local, lo re-encodea a WebP con sharp al ancho del rol y lo sube a
// landing-assets/{businessId}/{uuid}.webp. Si sharp falla, DEGRADA a subir el binario original tal
// cual con su content-type (fail-safe — no bloquear SKILL-03). Devuelve la URL pública de Storage.
// NUNCA referencia el CDN de IG: solo entra al config la URL pública del bucket (SKILL-03 / Pitfall 1).
//
// ── PASSTHROUGH de lo que YA está en NUESTRO Storage (MODO EDICIÓN — D-04) ──────────────────────
// El SKILL.md, cuando no existe `landing-payloads/<slug>.json`, le ordena al agente reconstruir el
// BuilderInput DESDE el volcado de `--inspect` (`pendiente_de_aprobacion`). En esas columnas las
// imágenes NO son rutas del disco: son URLs https del bucket (ya re-hosteadas por una corrida
// anterior). Tratarlas como rutas locales tira ENOENT en readFile y el flujo documentado como
// "regla dura" NUNCA puede terminar; y el workaround obvio del agente (dropear los campos de imagen
// "porque no son rutas") le BORRA las fotos al dueño en silencio — el builder omite las secciones
// vacías. Por eso una URL de NUESTRO bucket se devuelve tal cual, sin re-subir.
//
// Se acota al PREFIJO DEL BUCKET PROPIO a propósito (no a "cualquier http(s)"): una URL del CDN de
// IG que se cuele por error tiene que SEGUIR siendo rechazada — nunca hot-link (SKILL-03 / Pitfall 1),
// esas URLs caducan y la foto desaparece de la web del dueño sin que nadie toque nada.
async function rehostImage(
  supabase: SupabaseClient,
  businessId: string,
  localPathOrUrl: string,
  role: 'hero' | 'gallery' | 'about' | 'rsv',
): Promise<string> {
  if (/^https?:\/\//i.test(localPathOrUrl)) {
    // Prefijo público del bucket, derivado del cliente (no hardcodea el project-ref):
    // `https://<ref>.supabase.co/storage/v1/object/public/landing-assets/`
    const bucketPublicPrefix = supabase.storage.from(BUCKET).getPublicUrl('').data.publicUrl
    if (localPathOrUrl.startsWith(bucketPublicPrefix)) return localPathOrUrl
    throw new Error(
      `${localPathOrUrl} es una URL EXTERNA. Las imágenes van como RUTA LOCAL del disco: el script ` +
        'las re-hostea al bucket (SKILL-03 — nunca hot-link al CDN de IG, esas URLs caducan). ' +
        'Descargala primero y pasá la ruta.',
    )
  }

  const raw = await readFile(localPathOrUrl) // bytes del disco (el SKILL.md ya los dejó localmente)

  const ext = 'webp'
  const contentType = 'image/webp'
  let buffer: Buffer
  try {
    // Re-encode a WebP + resize al ancho del rol (sin agrandar). Normaliza extensiones raras de IG.
    buffer = await sharp(raw)
      .resize({ width: ROLE_WIDTH[role] ?? 1080, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer()
  } catch (e) {
    // ⚠ ABORTA, NO DEGRADA (y NO se "arregla" volviendo a subir el binario crudo).
    // Antes esto caía a subir el archivo ORIGINAL tal cual con el content-type de la extensión. Pero
    // que sharp no pueda decodificarlo es EXACTAMENTE la señal de que ESO NO ES UNA IMAGEN: el
    // resultado era un archivo arbitrario del disco del operador servido desde un bucket `public:true`
    // (migr. 030), en una URL adivinable, y esa URL entraba al config (pasa `safeLinkUrl`: es https).
    // Un path equivocado en el payload publicaba el contenido de ese archivo. Es la misma doctrina que
    // el resto de la fase: en el WRITE PATH, un input inválido aborta ruidosamente — degradar en
    // silencio es peor que fallar.
    throw new Error(
      `${localPathOrUrl} no es una imagen decodificable (${e instanceof Error ? e.message : e}). ` +
        'Revisá la ruta en el payload; no se sube nada.',
    )
  }

  // namespacing OBLIGATORIO por {businessId}/ (Pitfall 3 / T-10-04): el service-role bypassa RLS,
  // pero la frontera de aislamiento cross-tenant es esta convención de path.
  //
  // ── LA KEY SE DERIVA DEL CONTENIDO (sha256), NO de un randomUUID() ────────────────────────────
  // Con un uuid nuevo por corrida, re-escribir el MISMO payload producía URLs NUEVAS ⇒ el config
  // resultante nunca era igual al anterior. Dos daños: (1) la promesa de idempotencia del SKILL.md
  // (D-06) era falsa; (2) tras una re-escritura del borrador, `landing_draft` difería de
  // `landing_config` SOLO por las URLs y el `--inspect` siguiente le gritaba al operador "el dueño
  // tiene cambios sin publicar: hero, gallery…" — atribuyéndole al dueño lo que había hecho el
  // propio operador. Un aviso que grita en el caso limpio es un aviso que se aprende a IGNORAR, y
  // ese aviso es justo la señal que esta fase construyó (D-01/D-02). Además duplicaba objetos en el
  // bucket público en cada corrida y los viejos no los borraba nadie.
  // Con la key = hash del contenido: re-subir la MISMA foto escribe la MISMA key (upsert → no-op) y
  // devuelve la MISMA URL. Misma foto ⇒ mismo config, byte a byte.
  const digest = createHash('sha256').update(buffer).digest('hex').slice(0, 32)
  const key = `${businessId}/${digest}.${ext}`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(key, buffer, { contentType, upsert: true })
  if (error) {
    throw new Error(`upload de ${localPathOrUrl} a ${key} falló: ${error.message}`)
  }
  // getPublicUrl construye la URL sin hardcodear el project-ref (el bucket es public:true, migr. 030).
  return supabase.storage.from(BUCKET).getPublicUrl(key).data.publicUrl
}

// Reemplaza CADA imagen del payload por un placeholder https VÁLIDO, para poder armar y GATEAR el
// config ANTES de subir un solo byte al bucket (paso 5). El builder y el gate solo miran la FORMA de
// la URL (`safeLinkUrl` = allowlist de protocolo http/https): un config armado con placeholders tiene
// EXACTAMENTE la misma forma que el final — mismas secciones habilitadas, mismo copy, mismo tema.
// Sin esto, un payload que el gate va a rechazar igual dejaba objetos PÚBLICOS huérfanos en Storage
// (el paso de subida corría antes del gate) que nadie limpia nunca.
function withPlaceholderImages(input: BuilderInput): BuilderInput {
  const clone: BuilderInput = structuredClone(input)
  let n = 0
  const ph = () => `https://placeholder.invalid/${n++}.webp`
  if (clone.hero?.image) clone.hero.image = ph()
  if (clone.about?.image) clone.about.image = ph()
  if (clone.gallery?.images?.length) clone.gallery.images = clone.gallery.images.map(() => ph())
  if (clone.rsv?.images?.length) clone.rsv.images = clone.rsv.images.map(() => ph())
  return clone
}

// ── MODO ESCRITURA ──────────────────────────────────────────────────────────────────
// Orden EXACTO (Pitfall 3: nada se escribe hasta tener todo resuelto y validado):
//   1) resolver business_id  2) leer el estado draft/publicado  3) AVISO de choque (D-01/D-02)
//   4) tema (recommendTheme)  5) PRE-GATE del config con placeholders — nada se sube si no valida
//   6) re-hostear imágenes  7) armar el config real  8) GATE estricto de escritura
//   9) pre-print de --publish  10) UPDATE por id  11) mensaje de cierre.
//
// El paso 5 NO es redundante con el 8: el 8 valida lo que REALMENTE se persiste (con las URLs de
// Storage ya resueltas) y es el gate que manda. El 5 existe para que un payload inválido no ensucie
// antes un bucket PÚBLICO con objetos que nadie va a borrar. Los dos se quedan.
//
// `publish` es OPT-IN EXPLÍCITO (el flag `--publish`, resuelto en main() por presencia del token):
// nunca por defecto, nunca inferido de otra cosa. Con publish=false se escribe SOLO `landing_draft`
// (SKILL-07): la web nace como borrador.
async function runWrite(
  supabase: SupabaseClient,
  slug: string,
  configPath: string,
  publish: boolean,
) {
  // Leer + parsear el payload JSON (BuilderInput + brand hints) que dejó el SKILL.md.
  let payload: WritePayload
  try {
    payload = JSON.parse(await readFile(configPath, 'utf8')) as WritePayload
  } catch (e) {
    console.error(
      `[setup-landing] no pude leer/parsear el payload "${configPath}": ${e instanceof Error ? e.message : e}`,
    )
    process.exitCode = 1
    return
  }
  if (!payload?.input?.business?.name) {
    console.error('[setup-landing] payload inválido: falta input.business.name.')
    process.exitCode = 1
    return
  }

  // 1) Resolver business_id del slug (igual que inspect). Si no existe → abortar SIN escribir.
  const biz = await resolveBusiness(supabase, slug)
  if (!biz) {
    console.error(`[setup-landing] no existe ningún negocio con slug "${slug}".`)
    process.exitCode = 1
    return
  }
  const businessId = biz.id

  // 2) Leer el estado de las DOS columnas ANTES de tocar nada (ni una imagen subida todavía).
  const estado = readLandingState(biz)

  // 3) AVISO DE CHOQUE operador ↔ dueño (D-01/D-02). Desde la Phase 16 hay DOS escritores sobre
  //    `landing_draft`: el dueño (desde su editor) y este script. Si el dueño tiene cambios sin
  //    publicar, esta escritura se los pisa — y no hay historial ni undo.
  //
  //    ⚠ AVISA, NO ABORTA — y NO se le agrega una confirmación interactiva. A propósito:
  //    EL CHECKPOINT HUMANO VIVE EN EL SKILL.md (paso 6). Cuando este proceso Node arranca, la
  //    escritura YA está aprobada por el operador; el script solo IMPRIME el dato con el que se
  //    decidió. Quien bloquea es el flujo de la skill, no el proceso. Además el repo no tiene UNA
  //    sola confirmación interactiva en NINGÚN script —ni con el módulo nativo de Node ni con una lib
  //    de terceros— y no es el momento de inventar el patrón. NO "arreglar" esto agregando una.
  //
  //    Es LA MISMA función que usa `--inspect` (avisoDeChoque): el aviso que el operador aprobó en el
  //    checkpoint y el que imprime la escritura no pueden divergir.
  const aviso = avisoDeChoque(estado, slug)
  if (aviso) console.log(aviso)

  // 4) Armar el tema (recommendTheme) con la lógica pura de 10-01.
  //    Por DEFAULT el landing hereda el theme/palette/font que el negocio YA configuró en Apariencia
  //    (la misma identidad de su web de reservas): partimos de la fila `businesses` y el payload solo
  //    PISA si el operador pasó un override explícito. Así la landing matchea el booking salvo que se
  //    pida lo contrario; recommendTheme solo adivina por vertical cuando el negocio no configuró nada.
  const brand: BrandHints = {
    vertical: payload.brand?.vertical ?? biz.vertical,
    theme: payload.brand?.theme ?? biz.theme,
    palette: payload.brand?.palette ?? biz.palette,
    font: payload.brand?.font ?? biz.font,
    primary_color: payload.brand?.primary_color ?? biz.primary_color,
  }
  const theme = recommendTheme(brand)

  // 5) PRE-GATE: validar el config ANTES de subir NADA al bucket público.
  //    Se arma el config con las imágenes reemplazadas por placeholders https (la forma es idéntica a
  //    la del config final: el gate valida protocolo, no dominio). Si el payload es basura, el script
  //    aborta ACÁ — con el bucket intacto. Antes la subida corría antes del gate: un config rechazado
  //    dejaba objetos públicos huérfanos en Storage, y el header de este bloque ("nada se escribe
  //    hasta tener todo resuelto y validado") era, en ese punto, falso.
  const preGate = parseLandingConfigForWrite(
    buildLandingConfig(withPlaceholderImages(payload.input), theme),
  )
  if (!preGate.ok) {
    console.error(
      `[setup-landing] el config NO pasa el gate de escritura (${preGate.error}) — abortado ANTES de ` +
        'subir ninguna imagen. Revisá el payload; el bucket quedó intacto.',
    )
    process.exitCode = 1
    return
  }

  // 6) Re-hostear cada imagen local referenciada en el payload, reemplazando la ruta por la URL
  //    pública de Storage. Se hace ANTES de armar el config real para que el builder reciba URLs
  //    válidas (el builder filtra con .url() estricto — una ruta local no pasaría y se perdería la
  //    imagen). Las imágenes que YA son URLs de nuestro bucket pasan de largo (MODO EDICIÓN, D-04).
  const input: BuilderInput = structuredClone(payload.input)
  try {
    if (input.hero?.image) {
      input.hero.image = await rehostImage(supabase, businessId, input.hero.image, 'hero')
    }
    if (input.about?.image) {
      input.about.image = await rehostImage(supabase, businessId, input.about.image, 'about')
    }
    if (input.gallery?.images?.length) {
      input.gallery.images = await Promise.all(
        input.gallery.images.map((p) => rehostImage(supabase, businessId, p, 'gallery')),
      )
    }
    // rsv: las fotos del strip de la reserva. Si el operador NO las pasa, el builder cae a las
    // primeras de la galería (ya re-hosteadas arriba) y acá no hay nada que hacer.
    if (input.rsv?.images?.length) {
      input.rsv.images = await Promise.all(
        input.rsv.images.map((p) => rehostImage(supabase, businessId, p, 'rsv')),
      )
    }
  } catch (e) {
    console.error(`[setup-landing] re-hosteo de imágenes falló: ${e instanceof Error ? e.message : e}`)
    process.exitCode = 1
    return
  }

  // 7) Armar el config REAL (buildLandingConfig) con las URLs de Storage ya resueltas.
  const landingConfig = buildLandingConfig(input, theme)

  // 8) GATE (SKILL-04 / T-10-06): validar ANTES de escribir. Config inválido → CERO UPDATE.
  //
  // POR QUÉ CAMBIÓ EL VALIDADOR (era `parseLandingConfig`, el de LECTURA): son contratos OPUESTOS.
  //   · `parseLandingConfig` es FAIL-SAFE: ante un `data` de sección inválido lo degrada a `{}` EN
  //     SILENCIO (los esquemas del render llevan `.catch({})` colgado) y devuelve un config que
  //     "parsea bien". En un WRITE PATH eso es peor que no validar: se persiste la degradación y el
  //     operador pierde la sección ENTERA sin que nadie se entere. El chequeo viejo contra
  //     DEFAULT_LANDING_CONFIG solo agarraba el caso en que el config COMPLETO era basura.
  //   · `parseLandingConfigForWrite` (lib/landing/write.ts) es el ESTRICTO de escritura: rechaza
  //     ruidosamente (`invalid_config` / `config_too_large`), valida el `data` de CADA sección contra
  //     el esquema de SU tipo (variantes `Strict`, sin `.catch`), aplica la allowlist de protocolo en
  //     TODAS las URLs (un `javascript:` ni siquiera llega a la DB) y topea el config en 256 KB.
  // Es exactamente la clase de bug que cerró T-15-16, en el único write path que quedaba afuera.
  const parsed = parseLandingConfigForWrite(landingConfig)
  if (!parsed.ok) {
    console.error(
      `[setup-landing] el config armado NO pasó el gate de escritura (${parsed.error}) — abortado, no se escribe nada.`,
    )
    process.exitCode = 1
    return
  }

  // 9) PRE-PRINT de --publish (D-03): antes de reemplazar la web al aire, decir QUÉ se reemplaza.
  if (publish) {
    if (estado.nuncaPublico) {
      console.log(
        `[setup-landing] --publish: este negocio NUNCA publicó — esto es su GO-LIVE ` +
          `(su /${slug} deja de mostrar la reserva simple y pasa a mostrar esta web).`,
      )
    } else if (estado.publicadoRoto) {
      // `estado.published` acá es el DEFAULT que inventó el validador fail-safe, NO la web real.
      // Listar SUS secciones sería describirle al operador un objeto que no existe en la DB, justo
      // en el segundo en que la va a reemplazar. Se dice la verdad: no se pudo leer.
      console.log('[setup-landing] --publish: vas a REEMPLAZAR la web que está al aire.')
      console.log(
        '  ⚠ No pude leer la web publicada (el `landing_config` de la DB no valida contra el schema): ' +
          'no puedo decirte qué secciones ni qué tema tiene hoy.',
      )
    } else {
      const prev = estado.published! // no es null: nuncaPublico === false
      const activas = prev.sections
        .filter((s) => s.enabled)
        .sort((a, b) => a.order - b.order)
        .map((s) => s.type)
      console.log('[setup-landing] --publish: vas a REEMPLAZAR la web que está al aire.')
      console.log(
        `  Web actual → secciones activas: ${activas.join(', ') || '(ninguna)'} · ` +
          `tema: ${prev.theme.preset}${prev.theme.overrides?.palette ? ` / ${prev.theme.overrides.palette}` : ''}`,
      )
    }
  }

  // 10) UPDATE filtrado por id resuelto del slug (NUNCA por slug — Pitfall 6 / T-10-07). Aislamiento
  //    por business_id.
  //
  // ⚠ QUÉ COLUMNAS SE ESCRIBEN, Y POR QUÉ CAMBIÓ EL DEFAULT (Phase 16 — SKILL-07 / D-03 / D-03b).
  // La decisión NO vive inline acá: la toma `landingWriteColumns(config, publish)` (lib/landing/write.ts),
  // que está unit-testeada en test/landing-write.test.ts. Este script no es unit-testeable
  // (side-effects, process.argv, service-role), y la regresión #1 de la fase —"el script pisa la web
  // publicada"— no puede quedar sin UN SOLO test que la agarre. No la re-implementes inline.
  //
  //   · publish=false (DEFAULT) → { landing_draft }. La clave `landing_config` NI EXISTE en el
  //     payload: la web al aire queda INTACTA. La web que arma el operador NACE COMO BORRADOR y
  //     espera la aprobación del dueño desde su panel. Éste es el cambio de la fase: hasta Phase 15
  //     el script era el ÚNICO escritor de la columna y publicaba al instante; hoy hay DOS escritores
  //     y publicar sin que NADIE haya mirado la web es el bug que este milestone viene a matar.
  //   · publish=true → las DOS columnas con el MISMO objeto parseado (`parsed.data`), byte-idénticas.
  //
  // POR QUÉ `--publish` ESCRIBE LAS DOS Y NO SOLO `landing_config` (incidente REAL del commit
  // `f98ed6b`, fix CR-01 — sigue VIGENTE en este camino, es la razón de D-03b): desde Phase 15 el dato
  // está partido en `landing_config` = LO PUBLICADO y `landing_draft` = LO QUE EL DUEÑO EDITA. Si al
  // publicar se escribiera solo `landing_config`, el borrador del dueño quedaría desincronizado con la
  // web VIEJA: al abrir /web vería su borrador anterior, el indicador le diría "Guardado — sin
  // publicar" y el botón Publicar —que es exactamente lo que la barra le pide tocar— REVERTIRÍA la web
  // que el operador acaba de publicar. No hay historial ni undo: pérdida de datos silenciosa. Con las
  // dos columnas idénticas, `deriveEditorState` le muestra `✓ Publicado`, que es la verdad.
  const { error: updErr } = await supabase
    .from('businesses')
    .update(landingWriteColumns(parsed.data, publish))
    .eq('id', businessId)
  if (updErr) {
    console.error(
      `[setup-landing] UPDATE de ${publish ? 'landing_draft + landing_config' : 'landing_draft'} falló:`,
      updErr.message,
    )
    process.exitCode = 1
    return
  }

  // 11) Mensaje de cierre, bifurcado por camino.
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
  if (publish) {
    // /[slug] es force-dynamic → sirve el config nuevo en el próximo request, sin deploy.
    console.log(`✓ Publicado: landing_config + landing_draft actualizados para "${slug}" (business ${businessId}).`)
    console.log(`  Al aire (force-dynamic, inmediato): ${appUrl}/${slug}`)
  } else {
    // SIN URL de preview a propósito: por defecto NO hay nada que ver en /<slug> (la web al aire, si
    // la hay, es la VIEJA). El preview compartible por link está explícitamente Out of Scope.
    console.log(
      `✓ Borrador (landing_draft) actualizado para "${slug}" (business ${businessId}). NO se tocó lo publicado.`,
    )
    console.log('  El dueño la revisa y la publica desde su panel (/web).')
    console.log(
      `  Solo si el dueño dio el OK, publicala desde acá:\n` +
        `    npm run setup:landing -- --slug ${slug} --config ${configPath} --publish`,
    )
  }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error(
      '[setup-landing] faltan credenciales en el entorno: ' +
        'NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY. ' +
        'Corré el script localmente con .env.local cargado.',
    )
    process.exitCode = 1
    return
  }

  // Client service-role explícito (bypassa RLS, Storage + UPDATE). Sin sesión persistida ni refresh:
  // es un proceso de un solo disparo (mismo patrón que setup-admin.ts).
  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // MODO INSPECT: `--inspect <slug>` (read-only). Tiene prioridad: nunca escribe.
  const inspectSlug = getFlag('inspect')
  if (inspectSlug) {
    await runInspect(supabase, inspectSlug)
    return
  }

  // MODO ESCRITURA: `--slug <slug> --config <path>`.
  const slug = getFlag('slug')
  const configPath = getFlag('config')
  if (!slug || !configPath) {
    console.error(
      '[setup-landing] uso:\n' +
        '  npm run setup:landing -- --inspect <slug>\n' +
        '      read-only: vuelca lo que está AL AIRE y lo que quedó PENDIENTE DE APROBACIÓN.\n' +
        '  npm run setup:landing -- --slug <slug> --config <ruta.json>\n' +
        '      escribe el BORRADOR (landing_draft). NO toca la web al aire: el dueño la publica desde /web.\n' +
        '  npm run setup:landing -- --slug <slug> --config <ruta.json> --publish\n' +
        '      escribe el borrador Y LO PUBLICA (la web sale al aire ya). Solo con el OK del dueño.',
    )
    process.exitCode = 1
    return
  }
  // `--publish` es OPT-IN EXPLÍCITO (token exacto en argv): sin él, la escritura va SOLO al borrador.
  await runWrite(supabase, slug, configPath, hasFlag('publish'))
}

main().catch((e) => {
  console.error('[setup-landing] falló:', e instanceof Error ? e.message : e)
  process.exitCode = 1
})
