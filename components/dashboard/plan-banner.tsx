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

  return (
    <div className="px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6">
      <div className={`rounded-lg px-4 py-3 flex items-center justify-between gap-3 flex-wrap ${
        isExpired ? 'bg-red-500/10 border border-red-500/30' : 'bg-amber-500/10 border border-amber-500/30'
      }`}>
        <p className={`text-sm font-medium ${isExpired ? 'text-red-400' : 'text-amber-400'}`}>
          {isExpired
            ? 'Tu período de prueba venció · Activá tu plan para seguir usando Forjo Gestión'
            : `Período de prueba · ${daysLeft} día${daysLeft === 1 ? '' : 's'} restante${daysLeft === 1 ? '' : 's'}`}
        </p>
        {isExpired ? (
          <a
            href={UPGRADE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold px-3 py-1.5 rounded-md whitespace-nowrap bg-red-500 text-white hover:opacity-80 transition-opacity"
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
