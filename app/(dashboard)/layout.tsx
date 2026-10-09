import type { Metadata, Viewport } from 'next'
import { NOINDEX } from '@/lib/noindex'
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/dashboard/sidebar'
import { PanelBottomNav } from '@/components/dashboard/panel-bottom-nav'
import { PanelTopBar } from '@/components/dashboard/panel-top-bar'
import { PlanBanner } from '@/components/dashboard/plan-banner'
import { TestModeBanner } from '@/components/dashboard/test-mode-banner'
import { MpConnectionBanner } from '@/components/dashboard/mp-connection-banner'
import { UnsavedChangesProvider } from '@/components/dashboard/unsaved-changes-guard'
import { VerticalProvider } from '@/lib/use-terminology'
import { resolveVertical } from '@/lib/verticals'
import { PaletteScript } from '@/components/palette-script'


// Ninguna pantalla de esta superficie va a buscadores. Ver `lib/noindex.ts` para por qué el meta
// va ADEMÁS del `app/robots.ts` (robots.txt pide no rastrear; el noindex es el que des-indexa).
export const metadata: Metadata = { robots: NOINDEX }

// VIEWPORT ACOTADO AL ROUTE GROUP (MOB-02). Va acá y NO en `app/layout.tsx` a propósito: el merge de
// viewport de Next es por CLAVE partiendo del default y se acumula sobre el árbol de ESA ruta, así
// que declararlo acá activa la zona segura en las 13 pantallas del panel y deja intactos el landing,
// la página pública de reservas `/[slug]` y el CRM — que son superficies de los CLIENTES de los
// negocios y que nadie pidió tocar por una barra del panel.
//   · La clave de ajuste al área física es lo que hace que `env(safe-area-inset-*)` devuelva un
//     valor > 0. Sin ella el inset vale 0 y la barra no puede pintar la franja de gestos.
//   · El valor del widget interactivo es el DEFAULT de la plataforma, o sea el comportamiento que ya
//     está en producción: declararlo explícitamente no cambia nada del teclado, y eso es exactamente
//     lo que se busca. Las dos alternativas rompen algo medido: una reflowearía el panel entero al
//     abrir el teclado (invalidando de una las mediciones de los cuatro quicks de teclado y drawers
//     de octubre) y la otra dejaría el elemento fijo flotando sobre el teclado.
// Exportar `metadata` y `viewport` en el mismo segmento es legal; lo prohibido es `viewport` junto a
// su variante dinámica.
export const viewport: Viewport = {
  viewportFit: 'cover',
  interactiveWidget: 'resizes-visual',
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: business } = await supabase
    .from('businesses')
    .select('*')
    .eq('owner_id', user.id)
    .single()

  if (!business) redirect('/onboarding')

  const planStatus = business.plan_status ?? 'trial'

  // D-06: suspender = corte REAL, no marca. Un negocio suspendido NO entra al dashboard — se redirige
  // a /suspendido (fuera del route group (dashboard), sin sidebar). Va antes del return del JSX para
  // no renderizar parcialmente el dashboard. redirect() LANZA NEXT_REDIRECT: no envolver en try/catch.
  if (planStatus === 'suspended') redirect('/suspendido')

  const daysLeft = business.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(business.trial_ends_at).getTime() - Date.now()) / 86_400_000))
    : 30

  const vertical = resolveVertical(business)

  return (
    <VerticalProvider vertical={vertical}>
      <PaletteScript palette={business.palette} theme={business.theme} font={business.font} />
      {/* El guard de salida tiene que envolver al SIDEBAR y a la PÁGINA a la vez: la bandera de
          cambios sin guardar nace en la página y se consulta en el sidebar, que son hermanos ⇒ el
          único punto en común es acá. Un provider client envolviendo children renderizados en el
          server es legal y ya es el patrón de este archivo (VerticalProvider). */}
      <UnsavedChangesProvider>
        <div className="min-h-screen">
          <Sidebar business={business} />
          {/* La barra inferior es HERMANA del sidebar y va sin props: los labels salen de
              useTerminology() y el VerticalProvider ya envuelve desde acá arriba. */}
          <PanelBottomNav />
          {/* El header de mobile es el TERCER hermano, y va con el negocio ya resuelto porque
              necesita su nombre (el título de sección sale de useTerminology(), igual que los
              labels de la barra). Reemplaza al header que vivía dentro del sidebar: misma
              visibilidad, misma posición, misma capa y mismo alto, sin el botón del menú y con una
              segunda línea. */}
          <PanelTopBar business={business} />
          {/* La reserva de alto de la barra se hace en UN SOLO lugar: el `pb` de acá abajo, en el
              mismo elemento que ya reserva el header con `pt-14`. Así ninguna de las 13 pantallas
              agrega padding inferior propio. El `lg:pb-0` es obligatorio y simétrico al `lg:pt-0`: a
              ≥1024px no hay barra y reservar alto ahí dejaría un hueco.
              ⚠ En el valor arbitrario NO puede haber ni un espacio: con espacios la clase no se
              genera, Tailwind no avisa, y el padding desaparece ⇒ la barra tapa el último elemento
              de cada pantalla. */}
          <main className="lg:pl-60 pt-14 lg:pt-0 min-h-screen pb-[calc(var(--panel-nav-h)+env(safe-area-inset-bottom,0px))] lg:pb-0">
            <TestModeBanner />
            <MpConnectionBanner connectionError={business.mp_connection_status === 'error' && !!business.mp_user_id} />
            <Suspense fallback={null}>
              <PlanBanner planStatus={planStatus} daysLeft={daysLeft} />
            </Suspense>
            <div className="p-4 sm:p-6 lg:p-8">
              {children}
            </div>
          </main>
        </div>
      </UnsavedChangesProvider>
    </VerticalProvider>
  )
}
