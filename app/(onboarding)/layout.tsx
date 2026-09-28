import type { Metadata } from 'next'
import { NOINDEX } from '@/lib/noindex'

// Layout del route group (onboarding). Existe SÓLO para colgar el `noindex`: la página de onboarding
// es un Client Component (`'use client'` en su primera línea) y un Client Component **no puede
// exportar `metadata`**, así que la única forma de darle el meta es un layout de servidor arriba.
//
// Por eso no agrega markup: devuelve `children` tal cual y no toca el chrome ni el tema.
// Ver `lib/noindex.ts` para por qué el meta va ADEMÁS del `app/robots.ts`.
export const metadata: Metadata = { robots: NOINDEX }

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return children
}
