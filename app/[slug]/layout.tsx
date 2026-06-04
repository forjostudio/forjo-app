import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import type { CSSProperties } from 'react'
import type { Metadata } from 'next'

// Deduplicates the DB call between generateMetadata and the component
const getSlugBusiness = cache(async (slug: string) => {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('businesses')
    .select('name, primary_color, logo_url')
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

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.substring(0, 2), 16)
  const g = parseInt(clean.substring(2, 4), 16)
  const b = parseInt(clean.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export default async function SlugLayout({ children, params }: LayoutProps) {
  const { slug } = await params
  const business = await getSlugBusiness(slug)

  const color = business?.primary_color ?? '#d94a2b'
  const style = {
    '--primary-color': color,
    '--primary-color-subtle': hexToRgba(color, 0.08),
    '--primary-color-border': hexToRgba(color, 0.4),
  } as CSSProperties

  return <div style={style}>{children}</div>
}
