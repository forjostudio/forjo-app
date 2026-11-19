import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OnboardingStep } from '@/lib/onboarding-steps'

// Stepper del onboarding, compartido por el wizard (`/onboarding`) y el paso 5
// (`/onboarding/integraciones`). Sin `'use client'`: no tiene hooks y lo renderizan los dos clientes.
//
// El número visible del nodo deriva de la POSICIÓN (idx+1) → 1-2-3-4 / 1-2-3-4-5 sin huecos aunque en
// canchas falte Profesionales; el estado activo/completado compara contra `s.n` (el paso real), no
// contra la posición. Las clases son las del stepper inline que vivía en el wizard, byte a byte, salvo
// el ancho del conector en mobile:
// - 5 nodos: 5·36 + 4·(24+8) = 308px, contra 343px útiles a 375px con `p-4`. Con el conector de
//   antes (`w-12`) daba 5·36 + 4·(48+8) = 404px y desbordaba.
// - 4 nodos (canchas con el paso 5, o el viejo wizard de 4): siguen con `w-12` → 312px, igual que hoy.
// Las dos clases van como literales completos para que Tailwind las vea.
export function OnboardingStepper({ steps, current }: { steps: OnboardingStep[]; current: number }) {
  const connectorWidth = steps.length > 4 ? 'w-6' : 'w-12'
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
              'h-px sm:w-20 mx-1 sm:mx-2 mb-4 transition-colors',
              connectorWidth,
              current > s.n ? 'bg-primary' : 'bg-border'
            )} />
          )}
        </div>
      ))}
    </div>
  )
}
