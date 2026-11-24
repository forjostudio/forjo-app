'use client'

import { useEffect, useId, useState, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { toast } from 'sonner'
import { Check } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { vueltaDeOAuthPendiente } from '@/lib/panel-tabs'
import { MP_CUENTA_EN_USO_TEXTO, oauthReturnNotice, type OAuthReturnNotice } from '@/lib/oauth-return'
import { stepperSteps, INTEGRACIONES_STEP } from '@/lib/onboarding-steps'
import { OnboardingStepper } from '@/components/onboarding/onboarding-stepper'

// ── Paso 5 del onboarding: «Conectá tus integraciones» ───────────────────────────────────────────
// Todo es opcional: «Ir al panel» está siempre habilitado (D-02) y no hay «Atrás» (D-01: el negocio ya
// existe; lo demás se edita desde el panel). Cada tarjeta inicia el MISMO OAuth que el panel, con
// `?from=onboarding` para que la vuelta aterrice acá (lista cerrada en `lib/oauth-return.ts`).
//
// Lo que se pinta como «Conectado» sale de los booleanos del server (leídos de la base por owner_id),
// nunca del `?mp=`/`?google=` de la URL: la query sólo dispara el aviso y se limpia enseguida.

type Provider = 'mp' | 'google'

interface Props {
  vertical: string
  mpEnabled: boolean
  mpConnected: boolean
  googleEnabled: boolean
  googleConnected: boolean
}

// Isotipo de MercadoPago (PNG oficial, igual que en Negocio → Integraciones). Decorativo: el nombre
// accesible lo da el título de la tarjeta.
function MpLogo({ className }: { className?: string }) {
  return <Image src="/mercadopago-isotipo.png" alt="" width={35} height={26} className={className} />
}

// Ícono de Google Calendar (PNG oficial, igual que en el panel). Decorativo.
function GoogleCalendarLogo({ className }: { className?: string }) {
  return <Image src="/google-calendar.png" alt="" width={20} height={20} className={className} />
}

/** Aviso inline de la tarjeta tras la vuelta del OAuth (el `success` va sólo por toast). */
type CardNotice = Exclude<OAuthReturnNotice, 'success'>

interface IntegrationCardProps {
  logo: ReactNode
  title: string
  description: string
  connected: boolean
  notice: CardNotice
  /** Esta tarjeta es la que se tocó y el navegador está yendo al proveedor. */
  connecting: boolean
  /** Alguna tarjeta está conectando: se deshabilitan los botones de las dos. */
  disabled: boolean
  connectLabel: string
  errorText: string
  /** Volvió `connected` pero la base no lo confirma: mensaje neutro, sin éxito ni error. */
  unconfirmedText: string
  /** La cuenta ya está conectada a otro negocio (quick 261124-obs). Sin él, se muestra `errorText`. */
  inUseText?: string
  onConnect: () => void
}

// Los botones de la tarjeta van en `outline` (IN-04): el único primario de la pantalla es «Ir al panel».
function IntegrationCard({ logo, title, description, connected, notice, connecting, disabled, connectLabel, errorText, unconfirmedText, inUseText, onConnect }: IntegrationCardProps) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className="rounded-lg border border-border p-4 space-y-3">
      <div>
        <div className="flex items-center gap-2">
          {/* Chip blanco: los logos oficiales están pensados para fondo claro (mismo chip que el panel). */}
          <span className="inline-flex items-center justify-center rounded-md bg-white size-6 shrink-0">
            {logo}
          </span>
          <h2 id={titleId} className="font-semibold text-sm">{title}</h2>
        </div>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>

      {connected ? (
        <p role="status" className="text-sm flex items-center gap-1.5">
          <Check aria-hidden="true" className="w-4 h-4 text-primary shrink-0" /> Conectado
        </p>
      ) : notice === 'error' ? (
        <div className="space-y-3">
          <p role="alert" className="text-sm text-destructive">{errorText}</p>
          <Button variant="outline" className="h-11 w-full sm:w-auto" onClick={onConnect} disabled={disabled}>
            {connecting ? 'Conectando…' : 'Reintentar'}
          </Button>
        </div>
      ) : notice === 'cuenta-en-uso' ? (
        // Sólo se ve sin conexión (la rama `connected` va primero). El botón es el de conectar y no
        // «Reintentar»: repetir con la misma cuenta vuelve a fallar.
        <div className="space-y-3">
          <p role="alert" className="text-sm text-destructive">{inUseText ?? errorText}</p>
          <Button variant="outline" className="h-11 w-full sm:w-auto" onClick={onConnect} disabled={disabled}>
            {connecting ? 'Conectando…' : connectLabel}
          </Button>
        </div>
      ) : notice === 'unconfirmed' ? (
        <div className="space-y-3">
          <p role="status" className="text-sm text-muted-foreground">{unconfirmedText}</p>
          <Button variant="outline" className="h-11 w-full sm:w-auto" onClick={onConnect} disabled={disabled}>
            {connecting ? 'Conectando…' : connectLabel}
          </Button>
        </div>
      ) : (
        <Button variant="outline" className="h-11 w-full sm:w-auto" onClick={onConnect} disabled={disabled}>
          {connecting ? 'Conectando…' : connectLabel}
        </Button>
      )}
    </section>
  )
}

export function IntegracionesClient({ vertical, mpEnabled, mpConnected, googleEnabled, googleConnected }: Props) {
  const [connecting, setConnecting] = useState<Provider | null>(null)
  const [mpNotice, setMpNotice] = useState<CardNotice>(null)
  const [googleNotice, setGoogleNotice] = useState<CardNotice>(null)

  // Vuelta del OAuth (D-05). Molde de Negocio → Integraciones, SIN `applyPanelView` (es el escritor del
  // historial del panel): acá alcanza un `replaceState`, que además es síncrono.
  useEffect(() => {
    const query = new URLSearchParams(window.location.search)
    if (!vueltaDeOAuthPendiente({ query })) return
    const mp = query.get('mp')
    const google = query.get('google')
    // Se lee ANTES del replaceState, que limpia la query entera (motivo incluido). quick 261124-obs.
    const motivo = query.get('motivo')
    // Limpieza SÍNCRONA: la segunda corrida del modo estricto ya no ve la query y el aviso sale una vez.
    window.history.replaceState(null, '', '/onboarding/integraciones')
    // El aviso va en la PRÓXIMA tarea: el `<Toaster>` está montado DESPUÉS de las páginas
    // (`app/layout.tsx`) y en un documento nuevo —siempre el caso del retorno del OAuth— un toast pedido
    // en el primer efecto se pierde sin error (medido en el panel, plan 04-02). El setState diferido,
    // además, no corre dentro del cuerpo del efecto.
    // Sin limpieza A PROPÓSITO: el desmontaje simulado del modo estricto la correría y, como la segunda
    // corrida ya no ve la query, el aviso no saldría nunca.
    // Qué se avisa lo decide el booleano del server, no la URL (IN-02, `oauthReturnNotice`): conectado
    // → éxito aunque diga `error`; no conectado + `error` → error inline; no conectado + `connected` →
    // mensaje neutro, sin anunciar un éxito que la base no confirma. `error` + motivo `cuenta-en-uso` →
    // el aviso de cuenta en uso (la lista cerrada la normaliza `oauthReturnNotice`).
    setTimeout(() => {
      const mpAviso = oauthReturnNotice(mp, mpConnected, motivo)
      if (mpAviso === 'success') toast.success('MercadoPago conectado')
      else if (mpAviso === 'cuenta-en-uso') toast.error(MP_CUENTA_EN_USO_TEXTO)
      else if (mpAviso === 'error') toast.error('No se pudo conectar con MercadoPago')
      if (mpAviso !== 'success') setMpNotice(mpAviso)
      const googleAviso = oauthReturnNotice(google, googleConnected)
      if (googleAviso === 'success') toast.success('Google Calendar conectado')
      else if (googleAviso === 'error') toast.error('No se pudo conectar con Google Calendar')
      if (googleAviso !== 'success') setGoogleNotice(googleAviso)
    }, 0)
  }, [mpConnected, googleConnected])

  // bfcache: si el dueño vuelve con el atrás desde la pantalla del proveedor, la página puede salir de
  // la caché con el botón trabado en «Conectando…». Al restaurarse, se suelta.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setConnecting(null)
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [])

  const connectMp = () => {
    setConnecting('mp')
    setMpNotice(null)
    window.location.assign('/api/mercadopago/connect?from=onboarding')
  }

  const connectGoogle = () => {
    setConnecting('google')
    setGoogleNotice(null)
    window.location.assign('/api/google/connect?from=onboarding')
  }

  return (
    <div className="min-h-screen p-4 pt-3 sm:pt-4 flex flex-col items-center">
      <div className="w-full max-w-2xl mt-0 sm:mt-8">
        <div className="relative text-center mb-8">
          <div className="flex items-center justify-center">
            <Image src="/brand/forjo-gestion-lockup-tinta.png" alt="Forjo Gestión" width={781} height={190} preload className="h-10 w-auto dark:hidden" />
            <Image src="/brand/forjo-gestion-lockup-crema.png" alt="Forjo Gestión" width={781} height={190} preload className="hidden h-10 w-auto dark:block" />
          </div>
          <p className="text-muted-foreground mt-2">Tu negocio ya está creado. Este paso es opcional.</p>
        </div>

        {/* Mismo stepper que el wizard, con este paso activo: los anteriores salen tildados por
            `current > s.n` (D-01). En canchas la numeración visible es 1-4 por posición. */}
        <OnboardingStepper steps={stepperSteps(vertical)} current={INTEGRACIONES_STEP.n} />

        <Card className="p-6">
          <div className="space-y-2">
            <h1 className="text-xl font-semibold">Conectá tus integraciones</h1>
            <p className="text-sm text-muted-foreground">
              Dejá todo listo antes de entrar al panel. Si ahora no podés, lo hacés después.
            </p>
          </div>

          <div className="space-y-4 mt-6">
            {mpEnabled && (
              <IntegrationCard
                logo={<MpLogo className="h-4 w-auto" />}
                title="MercadoPago"
                description="Cobrá las señas de los turnos directo en tu cuenta. Si no pedís seña al reservar, podés saltear esto."
                connected={mpConnected}
                notice={mpNotice}
                connecting={connecting === 'mp'}
                disabled={connecting !== null}
                connectLabel="Conectar con MercadoPago"
                errorText="No se pudo conectar con MercadoPago. Probá de nuevo o conectalo después desde Negocio → Integraciones."
                unconfirmedText="No pudimos confirmar la conexión con MercadoPago. Si ya la autorizaste, probá de nuevo."
                inUseText={MP_CUENTA_EN_USO_TEXTO}
                onConnect={connectMp}
              />
            )}
            {googleEnabled && (
              <IntegrationCard
                logo={<GoogleCalendarLogo className="h-4 w-auto" />}
                title="Google Calendar"
                description="Tus turnos aparecen solos en tu Google Calendar."
                connected={googleConnected}
                notice={googleNotice}
                connecting={connecting === 'google'}
                disabled={connecting !== null}
                connectLabel="Conectar Google Calendar"
                errorText="No se pudo conectar con Google Calendar. Probá de nuevo o conectalo después desde Negocio → Integraciones."
                unconfirmedText="No pudimos confirmar la conexión con Google Calendar. Si ya la autorizaste, probá de nuevo."
                onConnect={connectGoogle}
              />
            )}
          </div>

          <p className="text-sm text-muted-foreground mt-4">
            Podés conectarlas o cambiarlas cuando quieras desde Negocio → Integraciones.
          </p>

          <div className="flex justify-end mt-6 pt-4 border-t border-border">
            <Link href="/dashboard" className={cn(buttonVariants(), 'h-11 w-full sm:w-auto px-4')}>
              Ir al panel
            </Link>
          </div>
        </Card>
      </div>
    </div>
  )
}
