'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'

// Estado "revisá tu mail" compartido por /forgot-password (D-02) y el card de /register (D-12):
// son la misma pantalla conceptual ("andá a tu mail"), por eso se comparte en vez de duplicarse.
//
// RESTRICCIÓN DE SEGURIDAD NO NEGOCIABLE (D-02 / D-14 / Pitfall 4 del RESEARCH):
// este componente NO tiene ninguna rama condicional que dependa de si la cuenta ya está dada de
// alta, y NO recibe ningún prop que lo permita. Renderiza siempre lo mismo. Si el mensaje variara
// según el caso, el flujo se convertiría en un ORÁCULO de quién tiene cuenta en Forjo (user
// enumeration): cualquiera podría averiguar el mail de otro probando direcciones. Acá es donde esa
// garantía se hace estructural — no depende de que cada página se acuerde de respetarla.

// D-05: Supabase rate-limitea los mails (local: email_sent = 2/h en [auth.rate_limit]; prod lo
// gobierna el Dashboard). Sin cooldown el usuario quema su cuota en dos clicks nerviosos y deja de
// recibir mails sin entender por qué.
export const RESEND_COOLDOWN_SECONDS = 60

interface Props {
  /** La dirección a la que se mandó el mail. Se usa en el aria-label del botón de reenvío; la frase
   *  visible la arma cada consumidor dentro de `description`. */
  email: string
  title: string
  description: React.ReactNode
  /** Dispara el reenvío. El componente NO sabe qué se reenvía (link de recovery o de confirmación). */
  onResend: () => Promise<void>
  /** El link secundario del pie: cada uso pone el suyo. */
  children?: React.ReactNode
  /** Nivel del heading del título. Default 'h1' porque en /forgot-password este ES el encabezado
   *  principal de la página. /register lo baja a 'h2': ahí el h1 ya lo ocupa el lockup de marca, que
   *  vive fuera del ternario y por lo tanto se renderiza también en este estado — dos h1 en la misma
   *  página rompen la jerarquía de headings. El tamaño lo fija la clase, no la etiqueta: bajar el
   *  nivel no cambia nada visual (D-10). */
  headingLevel?: 'h1' | 'h2'
}

export function CheckYourEmail({ email, title, description, onResend, children, headingLevel = 'h1' }: Props) {
  const Heading = headingLevel
  // Arranca BLOQUEADO apenas monta, no en 0: cuando este componente aparece, el primer mail acaba de
  // salir. Si arrancara en 0, el usuario clickea "Reenviar" al toque y quema la cuota — que es
  // exactamente lo que D-05 evita.
  const [secondsLeft, setSecondsLeft] = useState(RESEND_COOLDOWN_SECONDS)
  const [resending, setResending] = useState(false)

  // Countdown de 1s. La higiene de cleanup se copia de components/dashboard/plan-banner.tsx:44-61
  // (el único setInterval del repo): sin `cancelled` + `clearInterval`, el intervalo sobrevive al
  // unmount y setea estado sobre un componente muerto. Cuando secondsLeft llega a 0, `running` se
  // apaga y el cleanup limpia el intervalo.
  const running = secondsLeft > 0
  useEffect(() => {
    if (!running) return
    let cancelled = false
    const id = setInterval(() => {
      if (cancelled) return
      setSecondsLeft((s) => (s <= 1 ? 0 : s - 1))
    }, 1000)
    return () => { cancelled = true; clearInterval(id) }
  }, [running])

  async function handleResend() {
    if (secondsLeft > 0 || resending) return
    setResending(true)
    try {
      await onResend()
    } finally {
      // El cooldown se reinicia PASE LO QUE PASE, incluido un error. No es prolijidad de UX: si solo
      // se reiniciara en el camino feliz, un error de rate limit dejaría el botón habilitado y el
      // propio rate limit se convertiría en un oráculo lateral de enumeration (Pitfall 4).
      setSecondsLeft(RESEND_COOLDOWN_SECONDS)
      setResending(false)
    }
  }

  return (
    <>
      <Heading className="font-[family-name:var(--font-heading)] text-2xl font-bold">{title}</Heading>
      <p className="text-muted-foreground text-sm mt-1.5 mb-6">{description}</p>
      {/* Sin aria-live en el texto del botón: el contador cambia cada segundo y spamearía a los
          lectores de pantalla. */}
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={secondsLeft > 0 || resending}
        onClick={handleResend}
        aria-label={`Reenviar mail a ${email}`}
      >
        {resending ? 'Reenviando...' : secondsLeft > 0 ? `Reenviar en ${secondsLeft}s` : 'Reenviar mail'}
      </Button>
      {children}
    </>
  )
}
