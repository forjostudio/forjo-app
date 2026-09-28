---
quick_id: 260928-seo
slug: el-boton-atras-del-celular-cierra-el-mod
date: 2026-09-28
type: quick
surface: panel — los wrappers compartidos de overlay
files_modified:
  - components/ui/dialog.tsx
  - components/ui/drawer.tsx
  - lib/overlay-history.ts
  - test/overlay-history.test.ts
---

# El botón "atrás" del celular cierra el modal, no la página

## El problema

Reportado en la UAT de v0.24 (2026-07-21) y documentado desde entonces sin arreglar. Con un modal
abierto en el panel (Nuevo turno, Nuevo abono, Editar servicio, …), el **back del celular navega a la
página anterior** en vez de cerrar el modal. El usuario pierde el contexto entero por un gesto que en
cualquier app nativa cierra el overlay.

**Causa:** los overlays no participan del modelo de historia del navegador. No pushean una entrada, así
que el back popea la última entrada de **ruta**.

## Por qué esto es chico (medido, 2026-09-28)

Los **35 `<Dialog>` y 4 `<Drawer>`** del panel pasan **todos** por un único wrapper cada uno —
`components/ui/dialog.tsx:12` y `components/ui/drawer.tsx:22`— y los dos son pass-through al
primitivo. Enganchar la historia ahí arregla los 39 de una. **No hay que tocar las 18 pantallas.**

⚠ **Esto NO arregla el otro bug** de navegación mobile (el back salta a otra sección, porque las
subsecciones in-page no son rutas). Ése es arquitectura y va como milestone propio.

## ⚠ La trampa que este plan existe para no pisar

`lib/panel-draft.ts:113-124` (`guardDraftOnDismiss`, la guarda de G-23-25 de la Phase 23) **sólo
muerde cuando `details.reason` es `'outside-press'` o `'escape-key'`**:

```ts
const accidental = details.reason === 'outside-press' || details.reason === 'escape-key'
if (accidental && isDirty()) { details.cancel(); onBlocked(); return }
close()
```

Un cierre disparado por `popstate` **no tiene ninguno de esos motivos**, así que caería directo en
`close()` y **descartaría un borrador con cambios sin avisar** — que es exactamente el bug que la
Phase 23 arregló y el dueño verificó en su UAT (tests 26 y 27). Reintroducirlo por la puerta de atrás
del celular sería peor que el bug que estamos arreglando.

**El back con un borrador sucio tiene que comportarse como el click afuera: avisar y NO cerrar.**

## Tareas

### Task 1 — El hook de historia, puro y testeable

**Acción:** crear `lib/overlay-history.ts` con la lógica separada del efecto de React, para poder
testearla sin DOM (el entorno de Vitest es `node`, sin jsdom — ver `test/catalog-public.test.ts` para
el molde de este repo).

Lo que tiene que resolver:
- Al **abrir**: pushear una entrada de historia marcada (p. ej. `{ overlay: <id> }`), para poder
  distinguir "back sobre un overlay" de una navegación real.
- Al cerrar **por cualquier otro camino** (✕, Guardar, Escape, click afuera): consumir esa entrada
  para no dejar basura en la pila — si no, el usuario tiene que apretar back dos veces.
- Al recibir `popstate` sobre una entrada de overlay: pedir el cierre **por el mismo camino que usa el
  componente**, con un `reason` propio.

**Cuidados (decidir y dejar escrito el porqué):**
- **Overlays anidados**: CLAUDE.md los prohíbe, pero el hook no debe romper si aparecen. Decidir si
  se apila o se ignora el segundo.
- **Doble push**: un re-render no puede pushear dos veces la misma entrada.
- **Desmontaje con el overlay abierto** (navegación mientras está abierto): no dejar el listener vivo
  ni una entrada huérfana.

**Verify:** `npx vitest run test/overlay-history.test.ts` con casos para abrir→back→cierra,
abrir→✕→sin entrada huérfana, y el desmontaje.

### Task 2 — Cablearlo en los dos wrappers, sin romper la guarda

**Acción:** consumir el hook en `components/ui/dialog.tsx:12` y `components/ui/drawer.tsx:22`.

**El requisito que manda:** el cierre por `popstate` tiene que pasar por el **mismo
`onOpenChange(open, details)`** que usan los demás motivos, con un `reason` propio y **con `cancel()`
disponible**, para que `guardDraftOnDismiss` pueda vetarlo igual que veta un click afuera.

Y hay que **sumar ese reason nuevo a la lista de "accidentales"** en `lib/panel-draft.ts:116`: un back
con un borrador sucio es tan accidental como un click afuera, y hoy esa lista es literal.

Si el cierre se veta, la entrada de historia **tiene que volver a pushearse** — si no, el modal queda
abierto pero sin su entrada, y el siguiente back se lleva la página.

**Cuidados:**
- Los overlays **no controlados** (los que no reciben `open` y se manejan con `Trigger`) tienen que
  seguir funcionando.
- **Cero cambio visual.** Esto no toca markup ni clases.
- `components/ui/dialog.tsx` lo consumen ~15 diálogos que nadie midió: la Phase 17 decidió
  explícitamente dejarlo byte-idéntico en lo visual. Se respeta.

**Verify:**
- `./node_modules/.bin/tsc --noEmit` — **nunca `npx tsc`** (siempre sale 0 acá, trampa documentada).
  Buscar `error TS` en la SALIDA.
- `npx vitest run` — piso **1365 passed / 97 archivos** (medido 2026-09-28), más los casos nuevos.
  ⚠ Dos canarios de reloj fallan a propósito fuera de `[01:00, 23:30]` AR; mirar la hora antes de
  culpar al cambio.
- `npx eslint` sobre los archivos tocados → rc=0.
- `ls supabase/migrations/*.sql | wc -l` → **41**. Cero paquetes nuevos.

## UAT (la parte que ningún test cubre)

En el **celular**, no en el emulador:

1. Abrir "Nuevo turno" → back → **cierra el modal** y queda en la agenda.
2. Con el modal cerrado, back → navega normalmente.
3. Abrir un modal, cerrar con la ✕, y después back → **navega** (no se comió un back de más).
4. ⚠ **Abrir "Editar servicio", tocar un campo, back** → **NO cierra**, avisa, y el borrador queda.
   Éste es el que protege lo de la Phase 23.
5. Lo mismo sin tocar nada → cierra sin fricción.
6. Un Drawer (mobile) → mismo comportamiento.

## Fuera de alcance

- **El bug B**: que el back salte a otra sección. Necesita convertir subsecciones in-page en rutas
  reales (hoy el detalle de cliente es `useState(selectedId)`, `clients-client.tsx:220`, y no hay
  **ni una** ruta dinámica en las 14 secciones del panel) más una política de back explícita. Es un
  milestone propio.
- Cualquier cambio visual de los overlays.
