import { createClient } from '@/lib/supabase/server'
import type { CSSProperties } from 'react'

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.substring(0, 2), 16)
  const g = parseInt(clean.substring(2, 4), 16)
  const b = parseInt(clean.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export default async function SlugLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: business } = await supabase
    .from('businesses')
    .select('primary_color')
    .eq('slug', slug)
    .single()

  const color = business?.primary_color ?? '#d94a2b'

  const style = {
    '--primary-color': color,
    '--primary-color-subtle': hexToRgba(color, 0.08),
    '--primary-color-border': hexToRgba(color, 0.4),
  } as CSSProperties

  return <div style={style}>{children}</div>
}
