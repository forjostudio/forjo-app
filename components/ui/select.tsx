"use client"

import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"

import { cn } from "@/lib/utils"
import { useDrawerPortalContainer } from "@/components/ui/drawer"
import {
  createHistoryBackDetails,
  useOverlayHistory,
  type OverlayHistoryBackDetails,
} from "@/lib/overlay-history"
import { ChevronDownIcon, CheckIcon, ChevronUpIcon } from "lucide-react"

/**
 * Lo que recibe el `onOpenChange` del wrapper: el detalle real de Base UI o el que sintetiza el
 * "atrás" del celular (quick 261006-dzr).
 *
 * NO se reusa `OverlayDismissDetails` de `lib/overlay-history` a propósito: esa unión lleva la rama
 * del DIÁLOGO, cuyos motivos (`'close-press'`, `'focus-out'`, …) y cuyo `preventUnmountOnClose` no
 * son los del Select. Usar la rama propia del Select mantiene el tipado exacto del primitivo para
 * cualquier caller futuro que quiera leer `details.reason`.
 */
type SelectDismissDetails =
  | SelectPrimitive.Root.ChangeEventDetails
  | OverlayHistoryBackDetails

/**
 * Props del wrapper = las del primitivo con UN solo cambio: el detalle que acompaña al cierre puede
 * ser el de Base UI o el del "atrás". Todo lo demás (`value`, `onValueChange`, `multiple`, `items`,
 * `disabled`, …) pasa derecho, así que los 23 call sites de la app no se tocan.
 */
type SelectProps<Value, Multiple extends boolean | undefined = false> = Omit<
  SelectPrimitive.Root.Props<Value, Multiple>,
  "onOpenChange"
> & {
  onOpenChange?: (open: boolean, details: SelectDismissDetails) => void
}

/**
 * El "atrás" del celular cierra el SELECTOR abierto, no el overlay de abajo (quick 261006-dzr).
 *
 * POR QUÉ ESTO ES UN WRAPPER Y ANTES ERA `const Select = SelectPrimitive.Root`
 * `useOverlayHistory` tiene que colgarse de algún lado, y un re-export directo no tiene dónde. Mismo
 * molde que `components/ui/dialog.tsx`: engancharlo ACÁ alcanza a los 23 `<Select>` de la app de una,
 * sin tocar ninguna pantalla. El pedido del dueño en la UAT fue literal: con el selector de Servicio
 * abierto dentro del alta de turno, el atrás se saltaba el selector y actuaba sobre el drawer.
 *
 * ⚠ POR QUÉ EL WRAPPER SE HACE CARGO DEL ESTADO DE APERTURA (la parte que define el trabajo)
 * `useOverlayHistory` sólo participa si el overlay es CONTROLADO (`open !== undefined` +
 * `dismiss !== undefined`): sin `open` no hay forma de saber el estado real ni de forzar el cierre, y
 * empujar una entrada que después no se puede consumir deja basura en la pila. Pero los 23 `<Select>`
 * son NO CONTROLADOS (medido: 0 de 23 pasa `open`; todos usan `value` + `onValueChange`), así que
 * enganchar el hook tal cual no habría hecho NADA. Por eso el wrapper mantiene él mismo el `open`
 * —`useState` inicializado con `defaultOpen`— y le pasa al primitivo un `open` SIEMPRE definido: el
 * primitivo queda controlado y el hook participa, con la API externa intacta.
 *
 * Si el caller SÍ pasa `open` (hoy ninguno, pero el tipo lo permite) manda el caller: `controlled`
 * hace que el estado interno quede dormido y nunca se pise el valor de afuera.
 *
 * POR QUÉ PASAR DE NO-CONTROLADO A CONTROLADO NO CAMBIA EL COMPORTAMIENTO (leído en el paquete, no
 * supuesto): `SelectRoot` resuelve la apertura con `useControlled({ controlled: openProp, default:
 * defaultOpen })` (`esm/select/root/SelectRoot.js`), y la ÚNICA diferencia entre las dos ramas es de
 * dónde sale el valor de `open` — `setOpenUnwrapped` es un no-op cuando está controlado. Todo lo
 * demás (`useTransitionStatus(open)` para la animación de cierre, `useOpenChangeComplete`, el foco,
 * `useDismiss`, la navegación y el typeahead por teclado) se alimenta del `open` ya resuelto. Y
 * `useControlled` fija `isControlled` en una ref del PRIMER render: como acá `open` siempre va
 * definido, el primitivo nunca ve un cambio de modo y no dispara su warning de dev.
 *
 * ⚠ EL ORDEN DE `handleOpenChange` ESPEJA AL DEL PRIMITIVO, Y NO ES COSMÉTICO. `SelectRoot.setOpen`
 * hace `onOpenChange?.(…)` → `if (eventDetails.isCanceled) return` → recién entonces mueve el estado.
 * Si acá moviéramos el estado antes de mirar `isCanceled`, un caller que llame `details.cancel()`
 * vería su veto IGNORADO (en no-controlado se respetaba). Mismo orden ⇒ mismo comportamiento.
 *
 * ⚠ NO SE TOCA `useDrawerPortalContainer` ni el portal del `SelectContent` (ver `SelectContent`): es
 * el arreglo que hace clickeables las opciones dentro de un drawer en mobile. Cero cambio visual:
 * este wrapper no renderiza ningún elemento propio ni agrega clases.
 */
function Select<Value, Multiple extends boolean | undefined = false>({
  open: openProp,
  defaultOpen,
  onOpenChange,
  ...props
}: SelectProps<Value, Multiple>) {
  // `defaultOpen` se consume ACÁ y NO se reenvía al primitivo: con `open` siempre definido el
  // primitivo lo ignoraría igual (`useControlled` sólo lo usa en la rama no controlada), así que el
  // único dueño del valor inicial es este estado. Como en `useControlled`, un `defaultOpen` que
  // cambie después del primer render no reabre nada — es la misma semántica que antes.
  const [selfOpen, setSelfOpen] = React.useState(defaultOpen ?? false)
  const controlled = openProp !== undefined
  const open = controlled ? openProp : selfOpen

  const handleOpenChange = (next: boolean, details: SelectDismissDetails) => {
    onOpenChange?.(next, details)
    if (details.isCanceled) return
    if (!controlled) setSelfOpen(next)
  }

  // El cierre por "atrás" viaja por el MISMO `onOpenChange` que el click afuera, el Escape y la
  // elección de una opción, con su propio motivo y un `cancel()` que funciona. El anidamiento lo
  // resuelve el módulo con el id por instancia (LIFO): un selector abierto dentro de un drawer se
  // cierra ÉL y la entrada del drawer, que quedó arriba del stack, hace que el drawer vea su propio
  // popstate como "de limpieza" y lo ignore.
  useOverlayHistory({
    open,
    dismiss: (event) => handleOpenChange(false, createHistoryBackDetails(event)),
  })

  return (
    <SelectPrimitive.Root
      open={open}
      onOpenChange={handleOpenChange}
      {...props}
    />
  )
}

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn("scroll-my-1 p-1", className)}
      {...props}
    />
  )
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("flex flex-1 text-left", className)}
      {...props}
    />
  )
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: SelectPrimitive.Trigger.Props & {
  size?: "sm" | "default"
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-fit items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)] *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        render={
          <ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />
        }
      />
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  alignItemWithTrigger = true,
  container,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset" | "alignItemWithTrigger"
  > &
  Pick<SelectPrimitive.Portal.Props, "container">) {
  // Dentro de un Drawer (vaul, mobile) el popup DEBE montarse en el subárbol del drawer: vaul es
  // modal y bloquea los pointer-events de todo lo que vive afuera, así que un portal a <body> se ve
  // pero no se puede clickear. Prioridad: `container` explícito (escape hatch) > contexto del drawer.
  // Si no hay ninguno (caso normal, fuera de drawers) NO se pasa `container` y el Portal se comporta
  // exactamente como antes.
  const drawerContainer = useDrawerPortalContainer()
  const portalContainer = container ?? drawerContainer

  return (
    <SelectPrimitive.Portal
      {...(portalContainer ? { container: portalContainer } : {})}
    >
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="isolate z-50"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          data-align-trigger={alignItemWithTrigger}
          className={cn("relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[align-trigger=true]:animate-none data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95", className )}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({
  className,
  ...props
}: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn("px-1.5 py-1 text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="flex flex-1 shrink-0 gap-2 whitespace-nowrap">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        render={
          <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />
        }
      >
        <CheckIcon className="pointer-events-none" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn(
        "top-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <ChevronUpIcon
      />
    </SelectPrimitive.ScrollUpArrow>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn(
        "bottom-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <ChevronDownIcon
      />
    </SelectPrimitive.ScrollDownArrow>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
