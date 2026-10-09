---
created: 2026-10-09T18:05:00.000Z
title: Los diálogos de Finanzas pierden el borrador al tocar afuera
area: finances
resolves_phase: null
files:
  - app/(dashboard)/finances/finances-client.tsx
---

## Problem

Con el diálogo **"Nueva venta"** abierto y con datos cargados, **tocar afuera lo cierra y se pierde
todo el trabajo**, sin aviso. Detectado por el dueño en la UAT en celular real de la Phase 2 de
v0.31 (2026-10-09), probando el caso del teclado abierto.

**No es un defecto de la Phase 2**: esa fase no tocó `finances-client.tsx`. Es un bug preexistente
que la UAT destapó de paso.

El repo **ya resolvió exactamente este problema** en otros tres diálogos y la solución nunca llegó
a Finanzas. Hoy los cuatro diálogos de alta/edición de Finanzas pasan su `onOpenChange` derecho al
setter, sin mirar el motivo del cierre:

```
app/(dashboard)/finances/finances-client.tsx:962   <Dialog open={saleModal}   onOpenChange={setSaleModal}>
app/(dashboard)/finances/finances-client.tsx:1101  <Dialog open={expenseModal} onOpenChange={setExpenseModal}>
app/(dashboard)/finances/finances-client.tsx:1141  <Dialog open={fixedModal}   onOpenChange={setFixedModal}>
```

El de "Nueva venta" es el más caro de perder: tiene Descripción, Cantidad, Monto, Fecha, Tipo y un
buscador de cliente anidado con su propio sub-formulario de alta.

## Solution

Reusar **`guardDraftOnDismiss`** (`lib/panel-draft.ts:127`), que es el patrón ya shippeado y
revisado. Veta exactamente tres motivos —`outside-press`, `escape-key` y `HISTORY_BACK_REASON`—
porque los tres son cierres **accidentales**, y deja pasar la ✕ y "Cancelar", que son deliberados.
Con el formulario **limpio** la guarda no muerde, así que el gesto de tocar afuera para descartar un
form vacío se conserva igual que hoy.

Precedentes a espejar, los dos con la misma forma:

- `components/dashboard/nuevo-turno-form.tsx:155`
- `components/dashboard/nuevo-abono-form.tsx:147`

```tsx
const handleDismiss = useCallback(
  (nextOpen: boolean, details: OverlayDismissDetails) =>
    guardDraftOnDismiss(() => dirtyRef.current, close, noticeDismissBlocked)(nextOpen, details),
  [close, noticeDismissBlocked],
)
```

⚠ **El aviso lo da el caller, no la guarda** (code-review WR-08 de la Phase 23): un `toast` **no
alcanza** como único canal, porque su región `aria-live` vive fuera del portal del diálogo y el modal
la marca `inert`. La pantalla tiene que **duplicar el mensaje adentro del popup**. Espejar cómo lo
hace `nuevo-turno-form`.

## Alcance sugerido

Los **tres** diálogos de alta/edición (`saleModal`, `expenseModal`, `fixedModal`), no sólo el de
ventas: los tres tienen el mismo agujero. Los de confirmación de borrado (`confirmDeleteSale`,
`confirmDeleteExpense`, `confirmDeleteFixed`) **quedan afuera**: no tienen borrador que perder.

Hace falta una señal de "sucio" por diálogo. Hoy no existe: habría que derivarla comparando el form
contra su estado inicial, que es lo que `dirtyRef` hace en los precedentes.

## Decisión del dueño

Ofreció tres caminos —sacar el cierre por toque afuera, poner una guarda, o conservar el borrador
hasta salir de Finanzas— y los tres le parecían bien. Se eligió la **guarda** porque es el patrón que
el repo ya tiene, ya revisado y con sus casos de borde resueltos (el botón atrás del celular y la
región `aria-live` inerte). Sacar el toque-afuera costaría un gesto útil con el form limpio;
conservar el borrador sería maquinaria de estado nueva, sin precedente en el repo y con preguntas
abiertas (recarga, cambio de pestaña, editar otra venta).
