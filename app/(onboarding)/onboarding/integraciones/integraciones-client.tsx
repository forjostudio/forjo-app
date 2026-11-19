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

interface IntegrationCardProps {
  logo: ReactNode
  title: string
  description: string
  connected: boolean
  error: boolean
  /** Esta tarjeta es la que se tocó y el navegador está yendo al proveedor. */
  connecting: boolean
  /** Alguna tarjeta está conectando: se deshabilitan los botones de las dos. */
  disabled: boolean
  connectLabel: string
  errorText: string
  onConnect: () => void
}

function IntegrationCard({ logo, title, description, connected, error, connecting, disabled, connectLabel, errorText, onConnect }: IntegrationCardProps) {
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
      ) : error ? (
        <div className="space-y-3">
          <p role="alert" className="text-sm text-destructive">{errorText}</p>
          <Button className="h-11 w-full sm:w-auto" onClick={onConnect} disabled={disabled}>
            {connecting ? 'Conectando…' : 'Reintentar'}
          </Button>
        </div>
      ) : (
        <Button className="h-11 w-full sm:w-auto" onClick={onConnect} disabled={disabled}>
          {connecting ? 'Conectando…' : connectLabel}
        </Button>
      )}
    </section>
  )
}

export function IntegracionesClient({ mpEnabled, mpConnected, googleConnected }: Props) {
  const [connecting, setConnecting] = useState<Provider | null>(null)
  const [mpError, setMpError] = useState(false)
  // El error de Google se setea ya desde el efecto de vuelta; su tarjeta se pinta con su route.
  const [, setGoogleError] = useState(false)

  // Vuelta del OAuth (D-05). Molde de Negocio → Integraciones, SIN `applyPanelView` (es el escritor del
  // historial del panel): acá alcanza un `replaceState`, que además es síncrono.
  useEffect(() => {
    const query = new URLSearchParams(window.location.search)
    if (!vueltaDeOAuthPendiente({ query })) return
    const mp = query.get('mp')
    const google = query.get('google')
    // Limpieza SÍNCRONA: la segunda corrida del modo estricto ya no ve la query y el aviso sale una vez.
    window.history.replaceState(null, '', '/onboarding/integraciones')
    // El aviso va en la PRÓXIMA tarea: el `<Toaster>` está montado DESPUÉS de las páginas
    // (`app/layout.tsx`) y en un documento nuevo —siempre el caso del retorno del OAuth— un toast pedido
    // en el primer efecto se pierde sin error (medido en el panel, plan 04-02). El setState diferido,
    // además, no corre dentro del cuerpo del efecto.
    // Sin limpieza A PROPÓSITO: el desmontaje simulado del modo estricto la correría y, como la segunda
    // corrida ya no ve la query, el aviso no saldría nunca.
    setTimeout(() => {
      // El éxito sólo se anuncia si la base lo confirma: un `?mp=connected` fabricado no dice nada.
      if (mp === 'connected' && mpConnected) toast.success('MercadoPago conectado')
      else if (mp === 'error') {
        toast.error('No se pudo conectar con MercadoPago')
        setMpError(true)
      }
      if (google === 'connected' && googleConnected) toast.success('Google Calendar conectado')
      else if (google === 'error') {
        toast.error('No se pudo conectar con Google Calendar')
        setGoogleError(true)
      }
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
    setMpError(false)
    window.location.assign('/api/mercadopago/connect?from=onboarding')
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

        <Card className="p-6">
          <div className="space-y-2">
            <h1 className="text-xl font-semibold">Conectá tus integraciones</h1>
            <p className="text-sm text-muted-foreground">
              Dejá todo listo antes de entrar al panel. Podés conectar una, las dos o ninguna.
            </p>
          </div>

          <div className="space-y-4 mt-6">
            {mpEnabled && (
              <IntegrationCard
                logo={<MpLogo className="h-4 w-auto" />}
                title="MercadoPago"
                description="Cobrá las señas de los turnos directo en tu cuenta. Si no pedís seña al reservar, podés saltear esto."
                connected={mpConnected}
                error={mpError}
                connecting={connecting === 'mp'}
                disabled={connecting !== null}
                connectLabel="Conectar con MercadoPago"
                errorText="No se pudo conectar con MercadoPago. Probá de nuevo o conectalo después desde Negocio → Integraciones."
                onConnect={connectMp}
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
