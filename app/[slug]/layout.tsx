import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { PaletteScript } from '@/components/palette-script'
import { resolveLandingTheme } from '@/lib/landing/theme'
import type { LandingTheme } from '@/lib/landing/schema'
import { buildMetadataParts } from '@/lib/landing/seo'
import type { Metadata } from 'next'

// Deduplicates the DB call between generateMetadata and the component
const getSlugBusiness = cache(async (slug: string) => {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('businesses')
    // Solo los campos de branding/metadata que consumen generateMetadata y el layout.
    // landing_config es columna no secreta (ya expuesta en public_businesses); se lee acá
    // para resolver el tema del landing (Phase 8 / THEME-03). No se leen secretos acá
    // (ya viven en business_secrets, migración 027/028).
    .select('slug, name, logo_url, palette, theme, font, landing_config')
    .eq('slug', slug)
    .single()
  return data
})

interface LayoutProps {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params

  // Fail-safe total (SEO-05 / D9-06): TODO el cuerpo va en try/catch. Si algo tira
  // (config corrupto, `new URL(base)` inválido, etc.) devolvemos un default válido y
  // NUNCA un 500 — la metadata jamás debe romper el render de la landing.
  try {
    const business = await getSlugBusiness(slug)
    // Sin negocio: devolvemos {} (page.tsx maneja el notFound real). No inventamos metadata.
    if (!business) return {}

    // buildMetadataParts (09-01) deriva { title, description } por-negocio desde el
    // landing_config ya traído por el `getSlugBusiness` cacheado — NO se agrega fetch.
    // El helper es total (parseo fail-safe del hero) y siempre devuelve strings válidos.
    const { title, description } = buildMetadataParts({
      business,
      landingConfig: business.landing_config,
    })

    // metadataBase (D9-03 / Pitfall 3): habilita que los campos URL relativos (og:url, y
    // la og:image que 09-03 inyecta por convención de archivo) se absoluticen solos. Mismo
    // patrón de base que lib/email.ts / lib/mercadopago.ts. `new URL(base)` puede tirar →
    // por eso vive dentro del try/catch fail-safe.
    const base = process.env.NEXT_PUBLIC_APP_URL || 'https://gestion.forjo.studio'

    // Strip cache-busting param — browsers reject favicon URLs with query strings
    const logo = business.logo_url?.split('?')[0] ?? null

    return {
      metadataBase: new URL(base),
      title,
      description,
      // og:url RELATIVO a propósito: metadataBase lo absolutiza. NO listamos `images`
      // a mano — la convención de archivo opengraph-image.tsx de 09-03 auto-inyecta el
      // meta og:image 1200x630 (listarla acá la duplicaría / pisaría).
      openGraph: {
        title,
        description,
        url: `/${slug}`,
        type: 'website',
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
      },
      // Conservamos el favicon/icons existente (logo del negocio sin cache-buster).
      ...(logo && {
        icons: {
          icon: [{ url: logo, type: 'image/png' }],
          shortcut: [logo],
          apple: [{ url: logo }],
        },
      }),
    }
  } catch {
    // Default válido ante cualquier falla: título genérico, jamás throw (SEO-05 / D9-06).
    return { title: 'Reservar turno' }
  }
}

export default async function SlugLayout({ children, params }: LayoutProps) {
  const { slug } = await params
  const business = await getSlugBusiness(slug)

  // Resuelve el tema del landing (Phase 8 / THEME-03): si landing_config.theme está presente,
  // su preset/overrides pisan a businesses.theme/palette/font SOLO en /[slug]; si está ausente
  // o malformado, resolveLandingTheme cae al fallback de businesses.* (cero regresión, D8-03).
  // El parseo es fail-safe: el helper es total y no 500ea el layout ante config corrupto.
  // landing_config es jsonb (shape no garantizado en TS). El cast solo nombra la forma esperada;
  // resolveLandingTheme es la barrera real: normaliza/valida cada campo y es total ante basura.
  const landingTheme = (business as { landing_config?: { theme?: LandingTheme } } | null)
    ?.landing_config?.theme
  const t = resolveLandingTheme(landingTheme, {
    theme: business?.theme,
    palette: business?.palette,
    font: business?.font,
  })

  // La página pública aplica el tema resuelto vía data-* + --primary inline en <html> (pre-paint).
  return (
    <>
      <PaletteScript palette={t.palette} theme={t.theme} font={t.font} primary={t.primary} />
      {children}
    </>
  )
}
