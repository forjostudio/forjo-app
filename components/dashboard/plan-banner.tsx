'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { PlanModal } from './plan-modal'
import { UPGRADE_URL } from '@/lib/plans'

interface Props {
  planStatus: string
  daysLeft: number
}

export function PlanBanner({ planStatus, daysLeft }: Props) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

  useEffect(() => {
    if (searchParams.get('subscription') === 'success') {
      setShowSuccess(true)
      const t = setTimeout(() => {
        setShowSuccess(false)
        router.replace('/dashboard')
      }, 5000)
      return () => clearTimeout(t)
    }
  }, [searchParams, router])

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
  const isPending = planStatus === 'pending_payment'

  if (showSuccess) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6">
        <div className="rounded-lg px-4 py-3 bg-green-500/10 border border-green-500/30">
          <p className="text-sm font-medium text-green-400">
            ¡Plan activado! Tu suscripción está activa.
          </p>
        </div>
      </div>
    )
  }

  if (!isExpired && !isTrial && !isPending) return null

  return (
    <div className="px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6">
      <div className={`rounded-lg px-4 py-3 flex items-center justify-between gap-3 flex-wrap ${
        isExpired ? 'bg-red-500/10 border border-red-500/30' : 'bg-amber-500/10 border border-amber-500/30'
      }`}>
        <p className={`text-sm font-medium ${isExpired ? 'text-red-400' : 'text-amber-400'}`}>
          {isExpired
            ? 'Tu período de prueba venció · Activá tu plan para seguir usando Forjo Gestión'
            : isPending
            ? 'Tu pago está pendiente de confirmación'
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
        ) : !isPending ? (
          <Button size="sm" className="h-7 text-xs bg-amber-500 text-black hover:bg-amber-400" onClick={() => setModalOpen(true)}>
            Activar plan
          </Button>
        ) : null}
      </div>
      <PlanModal open={modalOpen} onOpenChange={setModalOpen} />
    </div>
  )
}
