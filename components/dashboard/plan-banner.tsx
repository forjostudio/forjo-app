'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { PlanModal } from './plan-modal'
import { UPGRADE_URL } from '@/lib/plans'
import { Loader2, CheckCircle2, Clock } from 'lucide-react'

interface Props {
  planStatus: string
  daysLeft: number
}

// Polling cadence for the post-checkout confirmation screen.
const POLL_INTERVAL_MS = 3000
const POLL_TIMEOUT_MS = 36000

type ConfirmState = 'idle' | 'confirming' | 'active' | 'timeout'

export function PlanBanner({ planStatus, daysLeft }: Props) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)

  // Are we landing back from MercadoPago's checkout (the back_url)?
  const returning = searchParams.get('subscription') === 'success'

  // Confirmation state machine for the return screen. Seeded from the server-fetched
  // planStatus: if the webhook already flipped us to 'active' before the buyer got
  // back, show success immediately; otherwise enter the "confirming" + polling state.
  const [confirmState, setConfirmState] = useState<ConfirmState>(() => {
    if (!returning) return 'idle'
    return planStatus === 'active' ? 'active' : 'confirming'
  })

  // Poll the real business status until it turns 'active' or we hit the timeout.
  // Nothing is persisted here — we only read what the webhook writes.
  useEffect(() => {
    if (confirmState !== 'confirming') return
    let cancelled = false
    const start = Date.now()

    const id = setInterval(async () => {
      try {
        const res = await fetch('/api/subscription/status', { cache: 'no-store' })
        const data = await res.json()
        if (!cancelled && data.plan_status === 'active') {
          setConfirmState('active')
          return
        }
      } catch {
        // Network blip — keep polling until the timeout decides to stop.
      }
      if (!cancelled && Date.now() - start >= POLL_TIMEOUT_MS) {
        setConfirmState('timeout')
      }
    }, POLL_INTERVAL_MS)

    return () => { cancelled = true; clearInterval(id) }
  }, [confirmState])

  // On success: refresh server data so the layout's planStatus becomes 'active' and
  // strip the query param, then auto-dismiss the success banner after a few seconds.
  useEffect(() => {
    if (confirmState !== 'active') return
    router.replace('/dashboard')
    router.refresh()
    const t = setTimeout(() => setConfirmState('idle'), 5000)
    return () => clearTimeout(t)
  }, [confirmState, router])

  // Auto-open the plan modal if the user arrived from a landing CTA with an intended plan
  useEffect(() => {
    if (planStatus !== 'trial') return
    const intended = localStorage.getItem('forjo_intended_plan')
    if (intended) {
      localStorage.removeItem('forjo_intended_plan')
      setModalOpen(true)
    }
  }, [planStatus])

  const isExpired = planStatus === 'expired'
  const isTrial = planStatus === 'trial'

  // ── Post-checkout confirmation states (take priority over the normal banner) ──
  // ⚠ LAS TRES RAMAS DE `confirmState` NO SE COMPACTARON, a propósito. El achique de este banner
  // (una fila en vez de dos) se aplicó SÓLO a la rama normal de abajo. Las tres de acá:
  //   · son transitorias — viven segundos ('active' se auto-apaga a los 5s, 'confirming' hasta 36s)
  //     y sólo después de volver del checkout de MercadoPago, no en el día a día;
  //   · ya son UNA fila de layout: un icono + un `<p>`, sin botón ni segunda acción que subir;
  //   · así que no hay fila que eliminar. Lo único que quedaría por recortar es el TEXTO, y
  //     acortar "no reintentes el pago — ya lo recibimos" para ganar una línea en una pantalla que
  //     se ve una vez es cambiar claridad por píxeles en el peor momento posible para confundir.
  if (confirmState === 'active') {
    return (
      <div className="px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6">
        <div className="rounded-lg px-4 py-3 bg-green-500/10 border border-green-500/30 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
          <p className="text-sm font-medium text-green-400">
            ¡Plan activado! Tu suscripción está activa.
          </p>
        </div>
      </div>
    )
  }

  if (confirmState === 'confirming') {
    return (
      <div className="px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6">
        <div className="rounded-lg px-4 py-3 bg-blue-500/10 border border-blue-500/30 flex items-center gap-2">
          <Loader2 className="w-4 h-4 text-blue-400 flex-shrink-0 animate-spin" />
          <p className="text-sm font-medium text-blue-400">
            Estamos confirmando tu pago. En unos instantes vas a ver tu plan activo.
          </p>
        </div>
      </div>
    )
  }

  if (confirmState === 'timeout') {
    return (
      <div className="px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6">
        <div className="rounded-lg px-4 py-3 bg-amber-500/10 border border-amber-500/30 flex items-start gap-2">
          <Clock className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm font-medium text-amber-400">
            Tu pago puede tardar unos minutos en acreditarse. No reintentes el pago —
            ya lo recibimos. Refrescá esta página en unos minutos para ver tu plan activo.
          </p>
        </div>
      </div>
    )
  }

  if (!isExpired && !isTrial) return null

  // ── Las dos líneas del banner ──────────────────────────────────────────────────────────────────
  // Eran UNA sola línea con las dos mitades pegadas por un "·", y a 375px la línea medía 250px: con
  // el botón al lado no entraba en los 311px útiles, así que `flex-wrap` lo mandaba a una SEGUNDA
  // FILA. Partirla en título + detalle deja al botón en la misma fila que el texto.
  // MEDIDO con la fuente real (Space Grotesk self-hosteada, no la fallback del sistema, que da
  // otro ancho y no envuelve): el banner pasa de 102px a 76px a 375px.
  // Por qué importa más que los 26px: `plan_status` tiene DEFAULT 'trial' en el schema, así que este
  // banner está puesto en las 15 pantallas del panel de TODO negocio nuevo.
  const titulo = isExpired ? 'Tu período de prueba venció' : 'Período de prueba'
  const detalle = isExpired
    ? 'Activá tu plan para seguir usando Forjo Gestión'
    : `${daysLeft} día${daysLeft === 1 ? '' : 's'} restante${daysLeft === 1 ? '' : 's'}`

  return (
    <div className="px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6">
      {/* Sin `flex-wrap`: el botón ya no se va a una fila propia. Lo que absorbe el texto largo es el
          `min-w-0` del bloque de la izquierda — la segunda línea ENVUELVE (la rama expired la
          necesita: su detalle mide ~300px) en vez de truncarse, porque truncar justo la instrucción
          de "cómo seguir usando la app" sería peor que una línea más. */}
      <div className={`rounded-lg px-4 py-3 flex items-center justify-between gap-3 ${
        isExpired ? 'bg-red-500/10 border border-red-500/30' : 'bg-amber-500/10 border border-amber-500/30'
      }`}>
        <div className="min-w-0">
          {/* Jerarquía de dos líneas en el mismo espíritu que el header del panel (panel-top-bar):
              línea dominante arriba, dato secundario abajo más chico y atenuado. Acá la segunda va
              en 12px y no en los 11px del header: ahí es chrome de navegación de una palabra, acá es
              un dato que el dueño lee ("3 días restantes"). */}
          <p className={`text-sm font-medium leading-tight ${isExpired ? 'text-red-400' : 'text-amber-400'}`}>
            {titulo}
          </p>
          <p className={`text-xs leading-[1.3] ${isExpired ? 'text-red-400/80' : 'text-amber-400/80'}`}>
            {detalle}
          </p>
        </div>
        {isExpired ? (
          <a
            href={UPGRADE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold px-3 py-1.5 rounded-md whitespace-nowrap flex-shrink-0 bg-red-500 text-white hover:opacity-80 transition-opacity"
          >
            Ver planes
          </a>
        ) : (
          <Button size="sm" className="h-7 text-xs bg-amber-500 text-black hover:bg-amber-400" onClick={() => setModalOpen(true)}>
            Activar plan
          </Button>
        )}
      </div>
      <PlanModal open={modalOpen} onOpenChange={setModalOpen} />
    </div>
  )
}
