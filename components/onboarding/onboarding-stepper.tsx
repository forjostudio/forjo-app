import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OnboardingStep } from '@/lib/onboarding-steps'

// Stepper del onboarding, compartido por el wizard (`/onboarding`) y el paso 5
// (`/onboarding/integraciones`). Sin `'use client'`: no tiene hooks y lo renderizan los dos clientes.
//
// El número visible del nodo deriva de la POSICIÓN (idx+1) → 1-2-3-4 / 1-2-3-4-5 sin huecos aunque en
// canchas falte Profesionales; el estado activo/completado compara contra `s.n` (el paso real), no
// contra la posición. Las clases son las del stepper inline que vivía en el wizard, byte a byte, salvo
// el ancho del conector con 5 nodos, que escala por breakpoint (WR-01 del review):
// - < sm (etiquetas ocultas): 5·36 + 4·(24+8) = 308px contra 343px útiles a 375px con `p-4`.
// - desde sm se ven las etiquetas y cada columna mide lo que su etiqueta (medido por CDP con Space
//   Grotesk: 64+52+78+48+80 = 322px). Con el `sm:w-20` de 4 nodos medía ~689px (ya apretado, con «Tu
//   negocio» partido en dos líneas) contra 608px útiles a 640px y 672px (`max-w-2xl`) desde 704px:
//   desbordaba por los dos lados. Medido con el arreglo: `sm:w-10` → 546px; `md:w-14` → 610px; los dos
//   con 62px de aire.
//   Medido en 375/640/720/768/1024: `.planning/debug/probes/q8v-stepper-ancho.mjs`.
// - 4 nodos (canchas con el paso 5, o el viejo wizard de 4): siguen con `w-12 sm:w-20`, igual que antes.
// Las clases van como literales completos para que Tailwind las vea.
export function OnboardingStepper({ steps, current }: { steps: OnboardingStep[]; current: number }) {
  const connectorWidth = steps.length > 4 ? 'w-6 sm:w-10 md:w-14' : 'w-12 sm:w-20'
  return (
    <div className="flex items-center justify-center mb-8 gap-0">
      {steps.map((s, idx) => (
        <div key={s.n} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              aria-current={current === s.n ? 'step' : undefined}
              className={cn(
                'w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-colors',
                current > s.n ? 'bg-primary text-primary-foreground' :
                current === s.n ? 'bg-primary text-primary-foreground ring-4 ring-primary/20' :
                'bg-secondary text-muted-foreground'
              )}
            >
              {current > s.n ? <Check className="w-4 h-4" /> : idx + 1}
            </div>
            <span className={cn(
              'text-xs mt-1 hidden sm:block',
              current === s.n ? 'text-foreground font-medium' : 'text-muted-foreground'
            )}>{s.label}</span>
          </div>
          {idx < steps.length - 1 && (
            <div className={cn(
              'h-px mx-1 sm:mx-2 mb-4 transition-colors',
              connectorWidth,
              current > s.n ? 'bg-primary' : 'bg-border'
            )} />
          )}
        </div>
      ))}
    </div>
  )
}
