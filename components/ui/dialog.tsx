"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useShellScope } from "@/components/ui/shell-scope"
import { portalScopeClass } from "@/lib/shell-scope"
import {
  createHistoryBackDetails,
  useOverlayHistory,
  type OverlayDismissDetails,
} from "@/lib/overlay-history"
import { XIcon } from "lucide-react"

/**
 * Props del wrapper = las del primitivo con UN solo cambio: el detalle que acompaña al cierre puede
 * ser el de Base UI o el que sintetiza el "atrás" del celular (quick 260928-seo). Ver
 * {@link OverlayDismissDetails} — es una unión, así que la rama de Base UI llega intacta a las
 * pantallas y ninguna pierde tipado.
 */
type DialogProps = Omit<DialogPrimitive.Root.Props, "onOpenChange"> & {
  onOpenChange?: (open: boolean, details: OverlayDismissDetails) => void
}

function Dialog({ open, onOpenChange, ...props }: DialogProps) {
  // El "atrás" del celular cierra el diálogo en vez de navegar (quick 260928-seo). Engancharlo ACÁ
  // arregla los 35 diálogos del panel de una: todos pasan por este wrapper. El cierre viaja por el
  // MISMO `onOpenChange` que el click afuera y el Escape, con su propio motivo y un `cancel()` que
  // funciona, así que `guardDraftOnDismiss` puede vetarlo igual que veta un click afuera — sin eso el
  // back descartaría un borrador sucio sin avisar (G-23-25). Cero cambio de markup y de clases.
  useOverlayHistory({
    open,
    dismiss: onOpenChange
      ? (event) => onOpenChange(false, createHistoryBackDetails(event))
      : undefined,
  })
  return (
    <DialogPrimitive.Root
      data-slot="dialog"
      open={open}
      onOpenChange={onOpenChange}
      {...props}
    />
  )
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
}) {
  // Scope del shell activo (gap 1 de 14-VERIFICATION.md). El Popup se monta dentro de DialogPortal,
  // o sea en la RAÍZ del documento: sale del <div> que declara los tokens del shell y, como las
  // custom properties viajan por herencia del DOM, deja de resolverlos (dentro de los ConfirmDialog
  // del CRM la superficie de peligro caía al rojo de la app y "Alto"/"Medio" quedaban iguales).
  // Declarando acá las MISMAS clases que el shell, el popup y sus descendientes vuelven a resolver
  // los tokens correctos SIN reubicar el nodo — focus trap, scroll lock y stacking quedan intactos.
  // Va PRIMERO en el cn() para que el className del caller siga ganando los conflictos de utilidades
  // que resuelve tailwind-merge. Fuera de un proveedor de scope devuelve undefined y cn() lo
  // descarta: el className queda byte-idéntico al de antes de este plan.
  const shellScope = useShellScope()
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          portalScopeClass(shellScope),
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-2 right-2"
                size="icon-sm"
              />
            }
          >
            <XIcon
            />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
