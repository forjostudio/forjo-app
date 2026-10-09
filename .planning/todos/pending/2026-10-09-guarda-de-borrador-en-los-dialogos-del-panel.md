---
created: 2026-10-09T18:05:00.000Z
title: La guarda de borrador existe pero falta en casi todos los diálogos del panel
area: panel
resolves_phase: null
files:
  - app/(dashboard)/clients/clients-client.tsx
  - app/(dashboard)/finances/finances-client.tsx
  - app/(dashboard)/agenda/agenda-client.tsx
  - app/(dashboard)/appointments/appointments-client.tsx
  - app/(dashboard)/web/web-client.tsx
---

## Problem

Con un diálogo de edición abierto y con datos cargados, **tocar afuera lo cierra y se pierde todo el
trabajo**, sin aviso. Detectado por el dueño durante la UAT en celular real de la Phase 2 de v0.31
(2026-10-09): primero en **"Nueva venta"** de Finanzas, y después en **"Nuevo cliente"** de Clientes.

**No es un defecto de la Phase 2**: esa fase no tocó ninguno de esos archivos. Es deuda preexistente
que la UAT destapó.

**El repo ya resolvió este problema y la solución quedó a mitad de camino.** Barrido medido el
2026-10-09 sobre `app/(dashboard)`:

| Pantalla | Diálogos/Drawers | Usa la guarda |
|---|---|---|
| `settings/settings-client.tsx` | 4 | **sí** (5 usos) |
| `clients/clients-client.tsx` | 5 | **no** |
| `finances/finances-client.tsx` | 6 | **no** |
| `agenda/agenda-client.tsx` | 1 | **no** |
| `appointments/appointments-client.tsx` | 2 | **no** |
| `web/web-client.tsx` | 2 | **no** |

Más `components/dashboard/nuevo-turno-form.tsx` y `nuevo-abono-form.tsx`, que **sí** la usan.

Los dos casos que el dueño encontró:

```
app/(dashboard)/finances/finances-client.tsx:962   <Dialog open={saleModal}    onOpenChange={setSaleModal}>
app/(dashboard)/clients/clients-client.tsx:1038    <Dialog open={newClientOpen} onOpenChange={(o) => { setNewClientOpen(o); if (!o) resetNew() }}>
```

El de "Nuevo cliente" es el más literal: **resetea el formulario en cualquier cierre**, incluido el
toque afuera. El de "Nueva venta" es el más caro de perder: Descripción, Cantidad, Monto, Fecha, Tipo
y un buscador de cliente anidado con su propio sub-formulario de alta.

## Solution

Reusar **`guardDraftOnDismiss`** (`lib/panel-draft.ts:127`), que es el patrón ya shippeado y
revisado. Veta exactamente tres motivos —`outside-press`, `escape-key` y `HISTORY_BACK_REASON`—
porque los tres son cierres **accidentales**, y deja pasar la ✕ y "Cancelar", que son deliberados.
Con el formulario **limpio** la guarda no muerde, así que el gesto de tocar afuera para descartar un
form vacío se conserva igual que hoy.

Para los shells de **drawer** (vaul) existe la hermana **`guardDraftOnDrawerDismiss`**: vaul no
entrega motivo de cierre, así que ahí todo cierre originado por el drawer se trata como accidental.

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

## Alcance

**Entran** los diálogos con borrador que se pueda perder. Como mínimo, los dos que el dueño
encontró; idealmente la familia entera en una pasada, que es más barato que volver seis veces:

- Finanzas: `saleModal`, `expenseModal`, `fixedModal`
- Clientes: `newClientOpen`, `mergeModal`, `importOpen`
- Agenda, Turnos y `/web`: revisar cuáles de sus diálogos tienen borrador

**Quedan afuera** los de confirmación (`confirmDelete`, `confirmDeleteSale`, `confirmDeleteExpense`,
`confirmDeleteFixed`): no tienen nada que perder.

Hace falta una señal de "sucio" por diálogo. Hoy no existe en esas pantallas: hay que derivarla
comparando el form contra su estado inicial, que es lo que `dirtyRef` hace en los precedentes.

**Candidato a candado permanente**, en la línea de los que se agregaron en el bloque 10 de
`test/panel-nav-chrome.test.ts`: un barrido que afirme que todo `<Dialog>`/`<Drawer>` de
`app/(dashboard)` con un formulario adentro pasa por la guarda. Sin eso, la próxima pantalla nace sin
ella — que es exactamente cómo llegamos acá.

## Decisión del dueño

Ofreció tres caminos —sacar el cierre por toque afuera, poner una guarda, o conservar el borrador
hasta salir de la pantalla— y los tres le parecían bien. Se eligió la **guarda** porque es el patrón
que el repo ya tiene, ya revisado y con sus casos de borde resueltos (el botón atrás del celular y la
región `aria-live` inerte). Sacar el toque-afuera costaría un gesto útil con el form limpio;
conservar el borrador sería maquinaria de estado nueva, sin precedente en el repo y con preguntas
abiertas (recarga, cambio de pestaña, editar otro registro).
