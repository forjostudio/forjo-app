"use client"

import * as React from "react"
import { Drawer as DrawerPrimitive } from "vaul"

import { cn } from "@/lib/utils"
import { useOverlayHistory } from "@/lib/overlay-history"

// ── Contenedor de portales de los popups que viven DENTRO del drawer ─────────────────────────
// vaul (Radix Dialog por debajo) monta el drawer en modo MODAL: marca como inerte / bloquea los
// pointer-events de todo lo que está FUERA de su subárbol del DOM. Cualquier popup que se portalee
// a <body> (ej. el del Select de base-ui, que usa FloatingPortal) queda VISIBLE pero NO clickeable
// dentro de un drawer — era el bug de mobile en el alta manual de turno y en el alta de abono.
// Este contexto expone el nodo DOM del DrawerContent para que esos popups puedan montarse ADENTRO
// del subárbol del drawer y recuperar los pointer-events. Fuera de un drawer el valor es `null`,
// y el consumidor NO pasa `container` → comportamiento idéntico al de siempre (portal a la raíz).
const DrawerPortalContainerContext = React.createContext<HTMLElement | null>(null)

function useDrawerPortalContainer(): HTMLElement | null {
  return React.useContext(DrawerPortalContainerContext)
}

function Drawer({
  open,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  // El "atrás" del celular cierra el drawer en vez de navegar (quick 260928-seo). Los 4 drawers del
  // panel pasan por este wrapper, así que se arreglan los 4 de una.
  //
  // ACÁ NO VIAJA NINGÚN DETALLE DE CIERRE, a diferencia del Dialog: el contrato de vaul es
  // `onOpenChange?: (open: boolean) => void` — no tiene `reason` ni `cancel()` en NINGÚN motivo, ni
  // siquiera en los suyos. Inventarle un detalle sintético a todos los cierres del drawer sería
  // agregar un motivo falso a los cierres que hoy funcionan bien, y ningún drawer usa
  // `guardDraftOnDismiss` (es de los diálogos de Ajustes). Los dos drawers que SÍ tienen guarda de
  // borrador (el alta de turno y la de abono) vetan adentro de su `requestClose`, que abre su propio
  // diálogo "¿Descartar?" y NO baja `open` — y eso alcanza, porque el re-push de la entrada lo
  // decide el hook observando que el overlay siguió ABIERTO, nunca leyendo un `cancel()`. Un solo
  // mecanismo de veto para los dos wrappers.
  useOverlayHistory({
    open,
    dismiss: onOpenChange ? () => onOpenChange(false) : undefined,
  })
  return (
    <DrawerPrimitive.Root
      data-slot="drawer"
      open={open}
      onOpenChange={onOpenChange}
      {...props}
    />
  )
}

function DrawerTrigger({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Trigger>) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />
}

function DrawerPortal({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Portal>) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />
}

function DrawerClose({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Close>) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />
}

function DrawerOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Overlay>) {
  return (
    <DrawerPrimitive.Overlay
      data-slot="drawer-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function DrawerContent({
  className,
  children,
  ref,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Content>) {
  // El nodo del contenido va a `useState` (no a un `useRef`): hace falta un re-render cuando el nodo
  // se monta, si no los consumidores del contexto nunca verían el contenedor. La ref del caller,
  // si la hay, se sigue respetando (composición).
  const [contentNode, setContentNode] = React.useState<HTMLDivElement | null>(null)
  const setRefs = React.useCallback(
    (node: HTMLDivElement | null) => {
      setContentNode(node)
      if (typeof ref === "function") ref(node)
      else if (ref) ref.current = node
    },
    [ref]
  )

  return (
    <DrawerPortal data-slot="drawer-portal">
      <DrawerOverlay />
      <DrawerPrimitive.Content
        ref={setRefs}
        data-slot="drawer-content"
        className={cn(
          "group/drawer-content fixed z-50 flex h-auto flex-col bg-popover text-sm text-popover-foreground data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom]:mt-24 data-[vaul-drawer-direction=bottom]:max-h-[80vh] data-[vaul-drawer-direction=bottom]:rounded-t-xl data-[vaul-drawer-direction=bottom]:border-t data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=left]:w-3/4 data-[vaul-drawer-direction=left]:rounded-r-xl data-[vaul-drawer-direction=left]:border-r data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=right]:rounded-l-xl data-[vaul-drawer-direction=right]:border-l data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:max-h-[80vh] data-[vaul-drawer-direction=top]:rounded-b-xl data-[vaul-drawer-direction=top]:border-b data-[vaul-drawer-direction=left]:sm:max-w-sm data-[vaul-drawer-direction=right]:sm:max-w-sm",
          className
        )}
        {...props}
      >
        <div className="mx-auto mt-4 hidden h-1 w-[100px] shrink-0 rounded-full bg-muted group-data-[vaul-drawer-direction=bottom]/drawer-content:block" />
        {/* El Provider no renderiza DOM: sólo publica el nodo del drawer a los popups de adentro. */}
        <DrawerPortalContainerContext.Provider value={contentNode}>
          {children}
        </DrawerPortalContainerContext.Provider>
      </DrawerPrimitive.Content>
    </DrawerPortal>
  )
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-header"
      className={cn(
        "flex flex-col gap-0.5 p-4 group-data-[vaul-drawer-direction=bottom]/drawer-content:text-center group-data-[vaul-drawer-direction=top]/drawer-content:text-center md:gap-0.5 md:text-left",
        className
      )}
      {...props}
    />
  )
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function DrawerTitle({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn(
        "font-heading text-base font-medium text-foreground",
        className
      )}
      {...props}
    />
  )
}

function DrawerDescription({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
  useDrawerPortalContainer,
}
