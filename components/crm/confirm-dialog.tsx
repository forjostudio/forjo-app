'use client'

// ConfirmDialog escalonado (FND-03) — patrón de doble confirmación reutilizable.
//
// IMPORTANTE (Pitfall 2, plan 01-01): este dialog es UX/REFUERZO — NUNCA autoriza una acción.
// La garantía real vive server-side (`requireAdmin()` en el handler). Un atacante que salte el
// dialog (request directo a la server action) igual choca contra `requireAdmin()`. El botón
// deshabilitado y el type-to-confirm sólo reducen el error humano del operador legítimo.
//
// Compone el Dialog de @base-ui/react vía @/components/ui/dialog (focus trap / Escape / portal /
// outside-click ya resueltos — NO se hand-roll el overlay ni el trap de foco).
//
// Niveles (UI-SPEC §"Levels"):
//   - simple        → confirmWord undefined: un solo botón confirmar, habilitado de entrada.
//   - type-word     → confirmWord="SUSPENDER"/"VER"/"CONFIRMAR": botón disabled hasta que el
//                     input contiene la palabra EXACTA (case-sensitive).
//   - requireReason → además del type-word, exige un motivo no vacío (impersonación, Phase 3).

import * as React from 'react'
import { toast } from 'sonner'
import { Loader2Icon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { RiskBadge } from '@/components/crm/risk-badge'

// ── Tipos / contrato de props (locked, UI-SPEC §"Props contract") ───────────────
type Risk = 'alto' | 'medio' | 'bajo'

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  /** undefined ⇒ nivel simple (botón habilitado de entrada). */
  confirmWord?: string
  /** exige un motivo no vacío (textarea) además de la palabra. */
  requireReason?: boolean
  /**
   * Largo mínimo del motivo para habilitar confirmar (default 1 = el "no vacío" actual). Opcional y
   * aditivo: las llamadas que no la pasan conservan el comportamiento previo. Alinea el gating del
   * dialog con un mínimo server-side (impersonación: min 10) → feedback inline en vez del toast
   * genérico de error. NO es la garantía: el mínimo real vive server-side (Pitfall 5).
   */
  minReasonLength?: number
  risk: Risk
  confirmLabel: string
  /** destructive ⇒ botón confirmar con fondo --danger (la superficie de peligro del shell activo). */
  destructive?: boolean
  /**
   * Botón extra entre "Cancelar" y confirmar. Opcional y aditivo (sin él, footer de siempre).
   * Ofrece una SALIDA ejecutable cuando la acción principal no se puede hacer (13-03/D-12:
   * "Desactivar" ahí mismo, no mandar al dueño a buscar el switch).
   *
   * Tiene su PROPIO loading (WR-08): antes solo miraba `loading`, que es del confirmar, así que el
   * botón nunca se deshabilitaba mientras corría su propio trabajo (doble click ⇒ dos escrituras y
   * dos toasts) y el dialog se podía cerrar en el medio. El caller puede devolver `false` para
   * decir "falló, no cierres" — el dialog no cierra solo: cerrar es decisión del caller.
   */
  secondaryAction?: { label: string; onClick: () => boolean | void | Promise<boolean | void> }
  /**
   * Oculta el confirmar. Opcional y aditivo (default: se muestra, como hoy). Es el estado
   * *bloqueado* de 13-03/D-11: ofrecer un "Eliminar" que la DB ya se sabe que rechaza es mal UX.
   */
  hideConfirm?: boolean
  /**
   * Reemplaza el toast genérico del catch de handleConfirm (quien no la pasa no cambia). Deja al
   * caller mostrar el motivo REAL del rechazo (ej. el message del trigger). El dialog no cierra.
   */
  onConfirmError?: (err: unknown) => void
  onConfirm: (reason?: string) => Promise<void>
}

// ── Helpers puros (testeados en confirm-dialog.test.tsx, environment node) ───────

export interface ConfirmStateInput {
  confirmWord?: string
  requireReason?: boolean
  /** Largo mínimo del motivo (default 1 = "no vacío"). Aditivo, ver ConfirmDialogProps. */
  minReasonLength?: number
  typed: string
  reason: string
  loading: boolean
}

export interface ConfirmState {
  wordOk: boolean
  reasonOk: boolean
  /** true sólo cuando el usuario tipeó algo que NO coincide (input vacío = neutral, no mismatch). */
  wordMismatch: boolean
  canConfirm: boolean
  wordHelper?: string
  reasonHelper?: string
}

/**
 * Deriva el estado de gating del botón confirmar a partir del input del usuario.
 * Fuente de verdad única del "qué habilita confirmar" — el componente sólo lo renderiza.
 */
export function computeConfirmState({
  confirmWord,
  requireReason,
  minReasonLength,
  typed,
  reason,
  loading,
}: ConfirmStateInput): ConfirmState {
  // Comparación EXACTA, case-sensitive (UI-SPEC §"Word input").
  const wordOk = !confirmWord || typed === confirmWord
  // minReasonLength es aditivo: default 1 = el "no vacío" histórico (quien no pasa la prop no cambia).
  const minLen = minReasonLength ?? 1
  const reasonLen = reason.trim().length
  const reasonOk = !requireReason || reasonLen >= minLen
  const canConfirm = wordOk && reasonOk && !loading

  // Mismatch sólo si hay palabra requerida y el usuario ya escribió algo distinto.
  const wordMismatch = !!confirmWord && typed.length > 0 && typed !== confirmWord
  const wordHelper = wordMismatch ? `Escribí "${confirmWord}" para confirmar` : undefined
  // Motivo vacío → "obligatorio"; no vacío pero por debajo del mínimo → helper de largo mínimo.
  const reasonHelper =
    requireReason && reasonLen === 0
      ? 'El motivo es obligatorio'
      : requireReason && reasonLen < minLen
        ? `El motivo debe tener al menos ${minLen} caracteres`
        : undefined

  return { wordOk, reasonOk, wordMismatch, canConfirm, wordHelper, reasonHelper }
}

/**
 * Construye el handler de submit con guard anti doble-submit. Si ya está `loading`, el segundo
 * disparo se ignora (no vuelve a llamar onConfirm). Resetea `loading` siempre (éxito o error),
 * y propaga el error para que el caller muestre el toast SIN cerrar el dialog.
 */
export function buildSubmitGuard({
  getLoading,
  setLoading,
  onConfirm,
}: {
  getLoading: () => boolean
  setLoading: (v: boolean) => void
  onConfirm: (reason?: string) => Promise<void>
}): (reason?: string) => Promise<void> {
  return async (reason?: string) => {
    if (getLoading()) return // anti doble-submit
    setLoading(true)
    try {
      await onConfirm(reason)
    } finally {
      setLoading(false)
    }
  }
}

/**
 * Deriva qué botones muestra el footer, misma regla que computeConfirmState: el "qué se muestra"
 * vive en un helper puro testeado, no inline en el render. Sin props nuevas devuelve el footer
 * histórico ([Cancelar] [confirmLabel]). Si el confirmar se oculta, el secundario asciende a
 * primario visual: si no, quedarían dos outline y ninguna acción evidente.
 */
export function computeFooterLayout(input: { hideConfirm?: boolean; hasSecondary?: boolean }): {
  showConfirm: boolean; showSecondary: boolean; secondaryVariant: 'default' | 'outline'
} {
  const showConfirm = !input.hideConfirm
  const showSecondary = !!input.hasSecondary
  return { showConfirm, showSecondary, secondaryVariant: !showConfirm && showSecondary ? 'default' : 'outline' }
}

/**
 * Clase del botón confirmar. destructive ⇒ la superficie de peligro del shell (--danger), que en el
 * CRM resuelve a --crm-danger y en el dashboard a --destructive; si no ⇒ el primario que trae <Button>.
 *
 * POR QUÉ --danger y no --crm-danger (gap 13-05 #1): este dialog se reusa en el DASHBOARD desde 13-03,
 * y --crm-danger sólo existe dentro de .crm-shell — afuera la var no resolvía y el botón quedaba sin
 * fondo. La indirección vive en globals.css; acá NUNCA se referencia el token de un shell puntual.
 *
 * El hover TAMPOCO se calcula acá (WR-06). Estaba cableado como un mix con negro, que oscurece la
 * superficie mientras el texto queda fijo: sirve cuando el par es crema sobre rojo oscuro (claro),
 * pero en dark el rojo es claro y el par es ink, así que oscurecer bajaba el contraste a 3.82:1 —
 * debajo de AA, y WCAG también aplica al hover. La dirección correcta depende del theme, o sea de
 * información que solo tienen los tokens: por eso se referencia --danger-hover, que cada bloque
 * declara junto a su --danger-foreground.
 */
export function confirmButtonClass(destructive?: boolean): string {
  return destructive
    ? 'bg-[var(--danger)] text-[var(--danger-foreground)] hover:bg-[var(--danger-hover)]'
    : ''
}

// Nota: la insignia de riesgo usa el RiskBadge compartido (@/components/crm/risk-badge) — antes
// había una copia inline (plan 01-04 wave 2 no dependía del plan 01-03 que lo crea); ya mergeado,
// se reusa el componente único para que Medio se vea amarillo y no se dupliquen variantes.

// ── Componente ───────────────────────────────────────────────────────────────────
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmWord,
  requireReason,
  minReasonLength,
  risk,
  confirmLabel,
  destructive,
  secondaryAction,
  hideConfirm,
  onConfirmError,
  onConfirm,
}: ConfirmDialogProps) {
  const [typed, setTyped] = React.useState('')
  const [reason, setReason] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const loadingRef = React.useRef(false)
  // Loading PROPIO de la acción secundaria (WR-08). Separado del confirmar porque son dos trabajos
  // distintos, pero bloquea lo mismo: doble click, cierre del dialog y el confirmar.
  const [secLoading, setSecLoading] = React.useState(false)
  const secLoadingRef = React.useRef(false)

  // ids para aria-describedby (helpers).
  const wordHelpId = React.useId()
  const reasonHelpId = React.useId()

  const state = computeConfirmState({ confirmWord, requireReason, minReasonLength, typed, reason, loading })
  const footer = computeFooterLayout({ hideConfirm, hasSecondary: !!secondaryAction })

  // Reset al cerrar (vía onOpenChange) — pero bloquear el cierre durante loading.
  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (loadingRef.current || secLoadingRef.current) return // no cerrable mientras corre CUALQUIERA de las dos acciones
      if (!next) {
        setTyped('')
        setReason('')
      }
      onOpenChange(next)
    },
    [onOpenChange]
  )

  // Guard anti doble-submit (la lógica pura vive en buildSubmitGuard, testeada). Se llama
  // desde un event handler (no en render), por lo que acceder al ref acá es correcto.
  const submit = React.useCallback(
    (reason?: string) =>
      buildSubmitGuard({
        getLoading: () => loadingRef.current,
        setLoading: (v) => {
          loadingRef.current = v
          setLoading(v)
        },
        onConfirm,
      })(reason),
    [onConfirm]
  )

  async function handleConfirm() {
    if (!state.canConfirm) return
    try {
      await submit(requireReason ? reason : undefined)
      // éxito: cerrar y limpiar.
      setTyped('')
      setReason('')
      onOpenChange(false)
    } catch (err) {
      // error: dialog QUEDA abierto en estado ready; toast (UI-SPEC §"error").
      console.error('[confirm-dialog] acción falló:', err instanceof Error ? err.message : err)
      // Si el caller trajo su propio handler, él sabe traducir el motivo real del rechazo; el
      // genérico sólo aplica cuando nadie más se hace cargo.
      if (onConfirmError) onConfirmError(err)
      else toast.error('No se pudo completar la acción. Probá de nuevo o revisá tu conexión.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={!loading && !secLoading}>
        <DialogHeader>
          <div className="flex items-center gap-2 pr-8">
            <DialogTitle>{title}</DialogTitle>
            <RiskBadge risk={risk} />
          </div>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {confirmWord && (
          <div className="flex flex-col gap-1.5">
            <Input
              autoFocus
              value={typed}
              disabled={loading}
              onChange={(e) => setTyped(e.target.value)}
              aria-invalid={state.wordMismatch || undefined}
              aria-describedby={state.wordHelper ? wordHelpId : undefined}
              className={cn('font-mono', state.wordMismatch && 'border-[var(--danger)]')}
              placeholder={confirmWord}
            />
            {state.wordHelper && (
              <p id={wordHelpId} className="font-mono text-xs text-[var(--danger)]">
                {state.wordHelper}
              </p>
            )}
          </div>
        )}

        {requireReason && (
          <div className="flex flex-col gap-1.5">
            <Textarea
              value={reason}
              disabled={loading}
              onChange={(e) => setReason(e.target.value)}
              aria-invalid={!!state.reasonHelper || undefined}
              aria-describedby={state.reasonHelper ? reasonHelpId : undefined}
              placeholder="Motivo del acceso (ej. soporte: revisar config)"
            />
            {state.reasonHelper && (
              <p id={reasonHelpId} className="text-xs text-[var(--danger)]">
                {state.reasonHelper}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <DialogClose
            render={<Button variant="outline" disabled={loading || secLoading} />}
          >
            Cancelar
          </DialogClose>
          {footer.showSecondary && secondaryAction && (
            <Button
              type="button"
              variant={footer.secondaryVariant}
              disabled={loading || secLoading}
              onClick={async () => {
                if (secLoadingRef.current) return // anti doble-submit, igual que buildSubmitGuard
                secLoadingRef.current = true
                setSecLoading(true)
                try {
                  await secondaryAction.onClick()
                } catch (err) {
                  // NO se traga el rechazo: el dialog queda abierto y el motivo se avisa.
                  console.error('[confirm-dialog] acción secundaria falló:', err instanceof Error ? err.message : err)
                  toast.error('No se pudo completar la acción. Probá de nuevo o revisá tu conexión.')
                } finally {
                  secLoadingRef.current = false
                  setSecLoading(false)
                }
              }}
            >
              {secLoading && <Loader2Icon className="animate-spin" />}
              {secondaryAction.label}
            </Button>
          )}
          {footer.showConfirm && (
            <Button type="button" onClick={handleConfirm} disabled={!state.canConfirm || secLoading} aria-disabled={!state.canConfirm || secLoading} className={confirmButtonClass(destructive)}>
              {loading ? (<><Loader2Icon className="animate-spin" />Confirmando…</>) : confirmLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
