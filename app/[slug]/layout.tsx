import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { PaletteScript } from '@/components/palette-script'
import type { Metadata } from 'next'

// Deduplicates the DB call between generateMetadata and the component
const getSlugBusiness = cache(async (slug: string) => {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('businesses')
    // select('*') (no lista explícita) → resiliente si theme/font aún no existen en DB
    // (deploy antes de la migración 014): quedan undefined → default Forjo, sin 42703.
    .select('*')
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

  // La página pública sigue la paleta del negocio vía data-palette en <html>.
  return (
    <>
      <PaletteScript palette={business?.palette} theme={business?.theme} font={business?.font} />
      {children}
    </>
  )
}
