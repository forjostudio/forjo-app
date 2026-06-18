import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { PaletteScript } from '@/components/palette-script'
import { resolveLandingTheme } from '@/lib/landing/theme'
import type { LandingTheme } from '@/lib/landing/schema'
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
  const business = await getSlugBusiness(slug)
  if (!business) return {}

  // Strip cache-busting param — browsers reject favicon URLs with query strings
  const logo = business.logo_url?.split('?')[0] ?? null

  return {
    title: `${business.name} — Reservar turno`,
    description: `Reservá tu turno en ${business.name}`,
    ...(logo && {
      icons: {
        icon: [{ url: logo, type: 'image/png' }],
        shortcut: [logo],
        apple: [{ url: logo }],
      },
    }),
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
