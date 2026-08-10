"use client"

import * as React from "react"

// ── Scope del shell que viaja a las superficies PORTALEADAS ──────────────────────────────────────
// Qué problema resuelve: los tokens visuales de un shell se declaran sobre un <div> del layout y
// llegan por HERENCIA del DOM. Todo lo que se portalea (el Popup del Dialog, que base-ui monta en la
// raíz del documento) sale de ese <div> aunque siga dentro del árbol de React del shell, así que las
// custom properties no le llegan y la superficie cae a los tokens de la app. Era el gap 1 de
// 14-VERIFICATION.md: dentro de los ConfirmDialog del CRM los chips "Alto" y "Medio" del RiskBadge
// se veían del mismo color. Este contexto publica las CLASES del shell activo para que la superficie
// portaleada las declare sobre sí misma y vuelva a resolver los tokens correctos.
//
// Molde: `DrawerPortalContainerContext` en `components/ui/drawer.tsx` — mismo problema (una
// superficie portaleada necesita información de su ancestro LÓGICO, no del DOM), misma forma
// (contexto privado + hook exportado). Acá viajan clases y no un nodo, porque el popup NO se reubica.
//
// El default `''` es la garantía anti-fuga (T-14-32): sin proveedor el hook devuelve cadena vacía,
// `portalScopeClass()` devuelve `undefined` y `cn()` lo descarta — el className queda byte-idéntico
// al de hoy en el dashboard, el booking público y el landing. El scope es OPT-IN: solo lo monta el
// layout que quiere que sus diálogos se vean como su shell.
//
// ALCANCE (deliberado): hoy lo consume ÚNICAMENTE `components/ui/dialog.tsx`, que es la única
// superficie con un defecto registrado. Otras superficies portaleadas (el popup del Select, por
// ejemplo) pueden adherirse después consumiendo este mismo hook; extenderlo sin un defecto que lo
// justifique cambiaría el aspecto de pantallas del CRM que la UAT de 14-07 ya dio por buenas.
const ShellScopeContext = React.createContext<string>("")

/**
 * Clases del shell activo. Fuera de un `ShellScopeProvider` devuelve `''` (sin scope).
 */
function useShellScope(): string {
  return React.useContext(ShellScopeContext)
}

/**
 * Publica las clases del shell a todo lo que se monte por debajo, incluido lo que se portalee.
 * No renderiza DOM propio: solo el Provider (mismo criterio que el del Drawer).
 */
function ShellScopeProvider({
  scope,
  children,
}: {
  scope: string
  children: React.ReactNode
}) {
  return <ShellScopeContext.Provider value={scope}>{children}</ShellScopeContext.Provider>
}

export { ShellScopeProvider, useShellScope }
