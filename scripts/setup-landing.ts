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
//     actual, servicios activos, estado del landing_config). NO sube nada, NO hace UPDATE. Es el
//     insumo que el SKILL.md muestra en el checkpoint humano antes de aprobar la escritura (research Q2).
//   · ESCRITURA → recibe el slug y un payload JSON (`--config <path>`): la materia prima del config
//     (un BuilderInput de lib/landing/builder.ts) con las imágenes como RUTAS LOCALES, más brand hints.
//     Resuelve slug→business_id, sube cada imagen local re-encodeada con sharp a
//     `landing-assets/{businessId}/{uuid}.{ext}`, reemplaza las rutas por URLs públicas de Storage,
//     arma el config con buildLandingConfig + recommendTheme, lo VALIDA con parseLandingConfig (gate
//     SKILL-04) y recién entonces hace `UPDATE ... WHERE id = businessId` (por id, NO por slug).
//
// POR QUÉ el payload llega por archivo JSON (`--config <path>`) y no por arg inline:
//   PowerShell pelea con el quoting de JSON en la CLI; un archivo temporal evita ese infierno y deja
//   el flujo del SKILL.md trivial (escribe un .json, llama al script con su ruta).
//
// USO (local, con .env.local cargado):
//   npm run setup:landing -- --inspect <slug>
//   npm run setup:landing -- --slug <slug> --config <ruta-al-payload.json>
//
// Cero deps npm nuevas: tsx/dotenv/@supabase/supabase-js/sharp/zod ya están (RESEARCH §Package Audit).

import { config as loadEnv } from 'dotenv'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import sharp from 'sharp'

import { buildLandingConfig, recommendTheme } from '@/lib/landing/builder'
import type { BuilderInput, BrandHints } from '@/lib/landing/builder'
import { parseLandingConfig, DEFAULT_LANDING_CONFIG } from '@/lib/landing/schema'

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

// ── Resolución del negocio por slug (compartida por inspect y escritura) ────────────
// Consulta la tabla BASE `businesses` con service-role (bypassa RLS): trae las columnas que el
// resumen/escritura necesitan. Devuelve la fila o null si el slug no existe.
async function resolveBusiness(
  supabase: SupabaseClient,
  slug: string,
) {
  const { data, error } = await supabase
    .from('businesses')
    .select(
      'id, name, slug, vertical, theme, palette, font, primary_color, whatsapp, landing_config',
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
  } | null
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
    // Volcado COMPLETO del landing_config actual (o null si no hay). Es el insumo con el que la skill
    // reconstruye el BuilderInput/brand de una landing SIN payload guardado (previa a la persistencia
    // de payloads) sin re-tipear todo el copy a mano (D-04, habilita SC2 de SKILL-05). Sigue read-only:
    // solo se imprime. Si ya hay config, re-correr la escritura lo SOBRE-ESCRIBE (A4).
    landing_config: biz.landing_config ?? null,
  }
  console.log('[setup-landing] inspect (read-only) —', slug)
  console.log(JSON.stringify(resumen, null, 2))
}

// ── Pipeline de imágenes: descarga/lee → re-encode sharp → upload service-role ──────
// Lee un archivo local, lo re-encodea a WebP con sharp al ancho del rol y lo sube a
// landing-assets/{businessId}/{uuid}.webp. Si sharp falla, DEGRADA a subir el binario original tal
// cual con su content-type (fail-safe — no bloquear SKILL-03). Devuelve la URL pública de Storage.
// NUNCA referencia el CDN de IG: solo entra al config la URL pública del bucket (SKILL-03 / Pitfall 1).
async function rehostImage(
  supabase: SupabaseClient,
  businessId: string,
  localPath: string,
  role: 'hero' | 'gallery' | 'about' | 'rsv',
): Promise<string> {
  const raw = await readFile(localPath) // bytes del disco (el SKILL.md ya los dejó localmente)

  let buffer: Buffer = raw
  let ext = 'webp'
  let contentType = 'image/webp'
  try {
    // Re-encode a WebP + resize al ancho del rol (sin agrandar). Normaliza extensiones raras de IG.
    buffer = await sharp(raw)
      .resize({ width: ROLE_WIDTH[role] ?? 1080, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer()
  } catch (e) {
    // Degradación fail-safe: subir el binario original tal cual, derivando ext/content-type del path.
    console.error(
      `[setup-landing] sharp falló para ${localPath} (${e instanceof Error ? e.message : e}); ` +
        'subo el binario original tal cual.',
    )
    buffer = raw
    ext = (path.extname(localPath).replace('.', '') || 'bin').toLowerCase()
    contentType = extToContentType(ext)
  }

  // namespacing OBLIGATORIO por {businessId}/ (Pitfall 3 / T-10-04): el service-role bypassa RLS,
  // pero la frontera de aislamiento cross-tenant es esta convención de path.
  const key = `${businessId}/${randomUUID()}.${ext}`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(key, buffer, { contentType, upsert: false })
  if (error) {
    throw new Error(`upload de ${localPath} a ${key} falló: ${error.message}`)
  }
  // getPublicUrl construye la URL sin hardcodear el project-ref (el bucket es public:true, migr. 030).
  return supabase.storage.from(BUCKET).getPublicUrl(key).data.publicUrl
}

// Mapeo mínimo extensión → content-type para la degradación (sharp ya da image/webp en el camino feliz).
function extToContentType(ext: string): string {
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'webp':
      return 'image/webp'
    case 'gif':
      return 'image/gif'
    case 'avif':
      return 'image/avif'
    default:
      return 'application/octet-stream'
  }
}

// ── MODO ESCRITURA ──────────────────────────────────────────────────────────────────
// Orden EXACTO (Pitfall 3: nada se escribe hasta tener todo resuelto y validado):
//   1) resolver business_id  2) re-hostear imágenes  3) armar config con builder
//   4) GATE parseLandingConfig  5) UPDATE por id  6) imprimir preview.
async function runWrite(
  supabase: SupabaseClient,
  slug: string,
  configPath: string,
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

  // 2) Re-hostear cada imagen local referenciada en el payload, reemplazando la ruta por la URL
  //    pública de Storage. Se hace ANTES de armar el config para que el builder reciba URLs válidas
  //    (el builder filtra con .url() estricto — una ruta local no pasaría y se perdería la imagen).
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

  // 3) Armar el tema (recommendTheme) y el config (buildLandingConfig) con la lógica pura de 10-01.
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
  const landingConfig = buildLandingConfig(input, theme)

  // 4) GATE (SKILL-04 / T-10-06): validar con parseLandingConfig ANTES de escribir. Si devuelve null
  //    o el DEFAULT (señal de inválido) → abortar SIN UPDATE. Nunca escribir un config que rompería el render.
  const parsed = parseLandingConfig(landingConfig)
  if (!parsed || parsed === DEFAULT_LANDING_CONFIG) {
    console.error('[setup-landing] el config armado NO pasó parseLandingConfig — abortado, no se escribe.')
    process.exitCode = 1
    return
  }

  // 5) UPDATE filtrado por id resuelto del slug (NUNCA por slug — Pitfall 6 / T-10-07). Aislamiento por business_id.
  //
  // ⚠ SE ESCRIBEN LAS DOS COLUMNAS, y no es "por las dudas": desde Phase 15 (migración 050) el dato
  // está partido en `landing_config` = LO PUBLICADO y `landing_draft` = LO QUE EL DUEÑO EDITA. Este
  // script ES un publish (el operador arma la web y la deja al aire), así que tiene que dejar el
  // MISMO invariante que publishLanding(): después de escribir, draft == published.
  // Si escribiera solo landing_config, el borrador del dueño quedaría desincronizado (con la web
  // VIEJA): al abrir /web vería su borrador anterior, el indicador le diría "Guardado — sin
  // publicar" y el botón Publicar —que es exactamente lo que la barra le pide tocar— REVERTIRÍA la
  // web que el operador acaba de armar. No hay historial ni undo: sería pérdida de datos silenciosa.
  const { error: updErr } = await supabase
    .from('businesses')
    .update({ landing_config: parsed, landing_draft: parsed })
    .eq('id', businessId)
  if (updErr) {
    console.error('[setup-landing] UPDATE de landing_config/landing_draft falló:', updErr.message)
    process.exitCode = 1
    return
  }

  // 6) Preview inmediata: /[slug] es force-dynamic → sirve el config nuevo en el próximo request.
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
  console.log(`✓ landing_config + landing_draft actualizados para "${slug}" (business ${businessId}).`)
  console.log(`  Preview (force-dynamic, inmediata): ${appUrl}/${slug}`)
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
        '  npm run setup:landing -- --inspect <slug>            (read-only)\n' +
        '  npm run setup:landing -- --slug <slug> --config <ruta.json>   (escritura)',
    )
    process.exitCode = 1
    return
  }
  await runWrite(supabase, slug, configPath)
}

main().catch((e) => {
  console.error('[setup-landing] falló:', e instanceof Error ? e.message : e)
  process.exitCode = 1
})
