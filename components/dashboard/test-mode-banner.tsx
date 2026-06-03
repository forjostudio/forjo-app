import { isMPTestMode } from '@/lib/mercadopago'

// Shown only when MP_MODE=test, so nobody confuses sandbox payments with real ones.
export function TestModeBanner() {
  if (!isMPTestMode()) return null

  return (
    <div
      role="status"
      className="sticky top-14 lg:top-0 z-40 flex items-center justify-center gap-2 bg-orange-500 px-4 py-1.5 text-center text-xs font-semibold text-black"
    >
      <span aria-hidden="true">⚠️</span>
      MODO PRUEBA — Los pagos son simulados
    </div>
  )
}
