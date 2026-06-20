import { ImageResponse } from 'next/og'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseLandingConfig, heroData } from '@/lib/landing/schema'
import {
  normalizeTheme,
  normalizePalette,
  THEME_PALETTES,
} from '@/lib/theme-config'

// ============================================================
// og:image dinámica 1200x630 por-negocio (SEO-02 / D9-01).
// Convención de archivo de Next: esta ruta especializada devuelve un PNG y Next
// auto-inyecta <meta og:image> (con width/height/type) en /[slug] — por eso 09-02
// NO lista openGraph.images a mano. Es independiente del layout/page: resuelve su
// propia data mínima por slug.
//
// Si el hero del negocio tiene foto → la usa a sangre; si no → branded (nombre del
// negocio sobre el color primario de SU paleta). Anda para TODOS sin subir nada y
// JAMÁS tira un 500 (SEO-05 / D9-06).
// ============================================================

// Config del archivo: Next los lee para el <meta og:image:*>.
export const alt = 'Vista previa del negocio'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Runtime Node (default): NO declaramos `export const runtime = 'edge'`. El client de
// Supabase (createAdminClient con service role) y la lectura por slug corren en Node sin
// las restricciones de Edge. Forzar Edge sería un anti-pattern para esta ruta (RESEARCH).

// Color de marca Forjo para el fail-safe absoluto del catch (D9-01: paleta 'red' de Forjo).
const FORJO_BG = '#d94a2b'

// Resuelve el hex primario branded reusando el motor existente (NO duplicar):
// normalizeTheme → normalizePalette → THEME_PALETTES[theme] por id → swatches[0] (acento).
function brandedHex(theme?: string | null, palette?: string | null): string {
  const t = normalizeTheme(theme)
  const palId = normalizePalette(t, palette)
  const list = THEME_PALETTES[t] || THEME_PALETTES.forjo
  const pal = list.find((p) => p.id === palId) ?? list[0]
  return pal?.swatches[0] ?? FORJO_BG
}

// Imagen branded: fondo = hex primario de la paleta, texto = nombre del negocio centrado.
// Solo flexbox (Satori NO soporta grid). Sin fuente custom: usamos la default de Satori
// (tipografía de marca en OG diferida — no hay .ttf en el repo y cargar fuente remota = punto
// de fallo de red, Pitfall 1).
function brandedImage(name: string, bgHex: string) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: bgHex,
        padding: '80px',
      }}
    >
      <div
        style={{
          fontSize: 72,
          fontWeight: 700,
          color: '#ffffff',
          textAlign: 'center',
          lineHeight: 1.1,
        }}
      >
        {name}
      </div>
    </div>
  )
}

// Default export de la convención: recibe params como Promise (Next 16, breaking v16.0.0 /
// Pitfall 2 — antes era objeto plano). Tipar como Promise igual que layout/page del repo.
export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  try {
    const { slug } = await params

    // Resolución de data mínima por slug con service role, leyendo SOLO columnas no secretas
    // (T-09-04 / V4 Access Control): name/theme/palette/landing_config. NUNCA secretos
    // (mp_access_token, resend_api_key, etc. viven en business_secrets) ni la fila entera.
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('businesses')
      .select('name, theme, palette, landing_config')
      .eq('slug', slug)
      .single()

    // Slug inexistente / negocio nulo → branded default Forjo (fail-safe, sin 500).
    if (!data) {
      return new ImageResponse(brandedImage('Forjo', FORJO_BG), { ...size })
    }

    const name = data.name || 'Forjo'

    // Foto del hero si existe: parseLandingConfig es total/fail-safe (safeParse). De la sección
    // hero saco heroData.parse(...).image. Si el config es null/legacy o no hay hero con image,
    // heroImage queda undefined y caemos al branded.
    const config = parseLandingConfig(data.landing_config)
    const heroSection = config?.sections.find((s) => s.type === 'hero')
    const heroImage = heroSection
      ? heroData.parse(heroSection.data).image
      : undefined

    if (heroImage) {
      // Foto a sangre: Satori hace su PROPIO fetch del PNG remoto (no pasa por next/image ni
      // remotePatterns, Assumption A2). objectFit cover para llenar 1200x630. Si el host bloquea
      // hotlink server-side, el render falla y el catch externo cae a branded (T-09-06, acept).
      return new ImageResponse(
        (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
            }}
          >
            {/* next/image NO aplica acá: Satori renderiza HTML/CSS a PNG server-side
                (no es el DOM del browser), el <img> crudo es la API documentada por Next
                para ImageResponse. alt="" porque la imagen ES el contenido del PNG (decorativa
                en el árbol de Satori). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={heroImage}
              alt=""
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
          </div>
        ),
        { ...size }
      )
    }

    // Sin foto → branded por nombre + hex primario de la paleta del negocio.
    return new ImageResponse(brandedImage(name, brandedHex(data.theme, data.palette)), {
      ...size,
    })
  } catch (e) {
    // Fail-safe absoluto (SEO-05 / D9-06): ante CUALQUIER error (DB caída, config corrupto,
    // foto que no renderiza, etc.) devolvemos un branded mínimo de marca Forjo. JAMÁS un 500.
    console.error('[opengraph-image] fallback branded:', e instanceof Error ? e.message : e)
    return new ImageResponse(brandedImage('Forjo', FORJO_BG), { ...size })
  }
}
