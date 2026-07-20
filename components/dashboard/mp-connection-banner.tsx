// Banner global del dashboard que avisa cuando la conexión OAuth de MercadoPago del negocio se cayó
// (mp_connection_status === 'error' con mp_user_id presente). Server Component sin estado ni hooks:
// el CTA es un <a href> al flujo OAuth existente, no necesita JS de cliente. Espeja el patrón de
// PlanBanner/TestModeBanner.
//
// Es PERSISTENTE (no dismissable) mientras la conexión esté caída: bloquea el cobro de señas
// (ingresos), mismo criterio que PlanBanner.
//
// SEGURIDAD (D-07): recibe SOLO un booleano derivado (connectionError) — estructuralmente no puede
// recibir ni exponer tokens/secretos ni el número de cuenta. La visibilidad se deriva del business
// ya resuelto por owner_id en el layout.
export function MpConnectionBanner({ connectionError }: { connectionError: boolean }) {
  if (!connectionError) return null

  return (
    <div className="px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6">
      <div
        role="status"
        className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 flex items-center justify-between gap-3 flex-wrap"
      >
        <p className="text-sm font-medium text-warning">
          Tu conexión con MercadoPago se interrumpió, reconectá tu cuenta para seguir cobrando señas.
        </p>
        {/* Route handler OAuth (no una page): navegación HTTP completa a propósito, no client-routing
            de next/link. Por eso <a> y no <Link>. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/api/mercadopago/connect"
          className="text-xs font-semibold px-3 py-1.5 rounded-md whitespace-nowrap bg-warning text-background hover:bg-warning/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning focus-visible:ring-offset-2 transition-colors"
        >
          Reconectar
        </a>
      </div>
    </div>
  )
}
