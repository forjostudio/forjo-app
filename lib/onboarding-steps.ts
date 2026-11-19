// ── Pasos del onboarding: navegación del wizard vs pintado del stepper ───────────────────────────
// `n` es el identificador ESTABLE de cada paso (n=1 Negocio … n=4 Horarios, n=5 Integraciones): el
// wizard keyea su contenido contra él (`step === 1/2/3/4`), así nada se corre cuando se oculta uno.
//
// Dos listas a propósito:
// - `wizardSteps` es la de NAVEGACIÓN del wizard (`currentIndex`, `isLastStep`, Atrás/Omitir/
//   Siguiente). Termina siempre en Horarios: si el 5 entrara acá, `isLastStep` dejaría de caer en
//   Horarios y el botón «Finalizar» desaparecería.
// - `stepperSteps` es la de PINTADO del stepper y del conteo del subtítulo: suma el paso 5
//   «Integraciones», que vive en su propia ruta (`/onboarding/integraciones`, D-01).
//
// En `canchas` una cancha no es un profesional humano: el paso Profesionales (n=3) no existe ahí.
// Módulo puro (sin React): lo usan los dos Client Components y su test.

export interface OnboardingStep {
  n: number
  label: string
}

const BASE_STEPS: readonly OnboardingStep[] = [
  { n: 1, label: 'Tu negocio' },
  { n: 2, label: 'Servicios' },
  { n: 3, label: 'Profesionales' },
  { n: 4, label: 'Horarios' },
]

export const INTEGRACIONES_STEP: OnboardingStep = { n: 5, label: 'Integraciones' }

/** Pasos que recorre el wizard (n 1-4; sin el 3 en canchas). Arreglo y objetos nuevos en cada llamada. */
export function wizardSteps(vertical: string): OnboardingStep[] {
  return BASE_STEPS
    .filter(s => vertical !== 'canchas' || s.n !== 3)
    .map(s => ({ ...s }))
}

/** Pasos que pinta el stepper: los del wizard + Integraciones (n=5). Arreglo y objetos nuevos. */
export function stepperSteps(vertical: string): OnboardingStep[] {
  return [...wizardSteps(vertical), { ...INTEGRACIONES_STEP }]
}
