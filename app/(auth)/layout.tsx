import { ResetThemeScript } from '@/components/reset-theme-script'

// Layout del route group (auth): padre común de (auth)/(split)/{login,forgot-password,reset-password}
// y (auth)/register → inyecta el reset del tema del tenant en las 4 pantallas de auth con un solo
// archivo (D-01). Al hacer logout con soft-nav, PaletteScript deja data-palette/theme/font pegados en
// <html>; este layout los revierte al tema Forjo base antes de pintar auth.
//
// Server Component (sin 'use client'): solo emite el <script> inline, cero markup visual. El panel
// Bauhaus vive en (auth)/(split)/layout.tsx a propósito: ponerlo acá arrastraría /register al split y
// violaría el diseño de Phase 4. Este layout es solo el vehículo del reset (D-04: no toca otros layouts).
// ResetThemeScript va ANTES de {children} para correr antes de pintarlos.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ResetThemeScript />
      {children}
    </>
  )
}
