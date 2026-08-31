'use client'

// ── Guard de salida compartido del panel: la mitad que /web dejó explícitamente afuera ───────────
//
// El editor CMS (`app/(dashboard)/web/web-client.tsx`) ya tiene su `beforeunload` y su cabecera
// documenta que la navegación INTERNA del panel NO queda interceptada — un click en "Turnos" con el
// borrador sucio lo descarta sin preguntar — porque interceptar la nav del App Router "es no-trivial".
// Este archivo resuelve esa mitad y la deja compartida. Lo pidió el uso real: el dueño cambió la
// duración del turno en Agenda, se fue del panel y perdió el cambio.
//
// CÓMO se intercepta (verificado contra la versión instalada, Next 16.2.7, no de memoria): con la
// prop `onNavigate` del `<Link>` del App Router — `node_modules/next/dist/client/app-dir/link.d.ts:170`,
// cuyo evento es `{ preventDefault: () => void }` y NADA más (no es un evento de React: no trae
// `currentTarget` ni `href`, por eso el destino se pasa a mano). Cancelar con `preventDefault()`
// cancela la navegación.
//
// Lo que `onNavigate` NO dispara, y está BIEN que no dispare: Ctrl/Cmd+click (abre pestaña nueva ⇒
// la página con cambios no se pierde), URLs externas, y links con `download`. Un `onClick` a mano
// dispararía en los tres casos y habría que filtrarlos.
//
// LÍMITE CONOCIDO, declarado en vez de hackeado: el BOTÓN ATRÁS/ADELANTE del navegador no está
// interceptado. El App Router de Next 16 no expone ninguna API de bloqueo de navegación para
// `popstate`, y el truco habitual (empujar una entrada falsa al history con `pushState` y revertirla)
// desincroniza el historial del router. `beforeunload` tampoco lo cubre: atrás es navegación
// client-side. Es un diferido a propósito, no un olvido.
//
// MOBILE: el drawer del sidebar se cierra en el `onClick` del link, o sea ANTES de que este guard
// cancele la navegación. El diálogo aparece con el drawer ya cerrado. Aceptado.
//
// ALCANCE: el guard sólo se arma cuando una página llama `useUnsavedChanges`. Hoy lo hace SÓLO
// Agenda. Extenderlo a /web, /servicios, /negocio o /settings es una línea por pantalla, pero es
// una decisión aparte.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { decideNavigation } from '@/lib/unsaved-changes'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type PendingNavigation = { href: string; proceed?: () => void }

type GuardApi = {
  // La llama la PÁGINA (vía useUnsavedChanges) para sincronizar su bandera sucia.
  setDirty: (dirty: boolean) => void
  // La llama el NAV. Devuelve true si BLOQUEÓ (el call-site tiene que cancelar su navegación).
  requestNavigation: (href: string, proceed?: () => void) => boolean
}

// Default no-op: fuera del provider el guard NUNCA bloquea. Mismo criterio que el DEFAULT de
// `lib/use-terminology.tsx` — un consumidor sin provider sigue funcionando, sólo que sin guard.
const DEFAULT: GuardApi = { setDirty: () => {}, requestNavigation: () => false }

const UnsavedChangesContext = createContext<GuardApi>(DEFAULT)

export function UnsavedChangesProvider({ children }: { children: React.ReactNode }) {
  // La bandera sucia va en un REF, no en estado. Este provider envuelve al sidebar Y a la página
  // entera: si fuera estado, cada encendido/apagado re-renderizaría el panel completo para nada. El
  // ref se lee en el momento del click, así que siempre está fresco.
  const dirtyRef = useRef(false)
  // Esto SÍ es estado: es lo que abre el diálogo.
  const [pending, setPending] = useState<PendingNavigation | null>(null)
  const pathname = usePathname()
  const router = useRouter()

  const setDirty = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty
  }, [])

  const requestNavigation = useCallback(
    (href: string, proceed?: () => void) => {
      // El "qué decidir" NO se reimplementa acá: vive en el helper puro y testeado.
      if (decideNavigation({ dirty: dirtyRef.current, href, currentPath: pathname }) === 'allow') return false
      setPending({ href, proceed })
      return true
    },
    [pathname],
  )

  // POR QUÉ `proceed` y no sólo el href: el logout no es un push. Es desloguear y DESPUÉS navegar.
  // Un guard que al confirmar empujara `/login` sin haber llamado a signOut() dejaría la sesión viva
  // y el proxy rebotaría al dashboard — falsa impresión de haber cerrado sesión. Con la continuación,
  // cada call-site declara qué significa "seguir" para él. Sin `proceed`, el default es router.push
  // (NUNCA redirect(): lanza NEXT_REDIRECT y dispara un toast espurio, precedente del CRM).
  function confirmLeave() {
    const nav = pending
    if (!nav) return
    // Apagar la bandera ANTES de ejecutar la continuación: si no, el push volvería a pasar por acá.
    dirtyRef.current = false
    setPending(null)
    if (nav.proceed) nav.proceed()
    else router.push(nav.href)
  }

  return (
    <UnsavedChangesContext.Provider value={{ setDirty, requestNavigation }}>
      {children}

      {/* El diálogo lo renderiza el PROVIDER, no cada página: es lo que permite que el sidebar
          (hermano de la página, no descendiente) dispare el aviso sin conocer nada del editor de
          horarios. Molde, copy y foco espejan el diálogo de descartar de /web (web-client.tsx:658).
          `onOpenChange(false)` — Escape, click afuera y el botón × — CANCELA la navegación, o sea
          equivale a "Seguir editando". Que la salida por descarte del modal sea la opción SEGURA y
          nunca la destructiva es una decisión, no una casualidad. */}
      <Dialog open={pending !== null} onOpenChange={(open) => { if (!open) setPending(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Salir sin guardar?</DialogTitle>
            <DialogDescription>
              Tenés cambios en los horarios que todavía no guardaste. Si salís ahora, se pierden.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" autoFocus className="min-h-11" onClick={() => setPending(null)}>
              Seguir editando
            </Button>
            <Button variant="destructive" className="min-h-11" onClick={confirmLeave}>
              Salir sin guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </UnsavedChangesContext.Provider>
  )
}

// Lo llama la PÁGINA. Sincroniza su bandera sucia con el provider y la APAGA al desmontarse: ese
// cleanup no es un detalle, es lo que garantiza que al salir de Agenda el panel entero vuelva a
// navegar sin fricción y que ninguna bandera quede prendida para siempre.
export function useUnsavedChanges(dirty: boolean) {
  const { setDirty } = useContext(UnsavedChangesContext)
  useEffect(() => {
    setDirty(dirty)
    return () => setDirty(false)
  }, [dirty, setDirty])
}

// Lo llama el NAV. Devuelve `requestNavigation(href, proceed?)` → true si bloqueó.
export function useNavigationGuard() {
  return useContext(UnsavedChangesContext).requestNavigation
}
