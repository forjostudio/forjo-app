---
quick_id: 261006-iey
slug: salir-sin-guardar-deja-la-seccion-vieja-
date: 2026-10-06
type: quick
requirements: [NAV-07, NAV-11]
surface: la continuación de "Salir sin guardar" + el scroll del calendario
files_modified:
  - lib/unsaved-changes.ts
  - components/dashboard/unsaved-changes-guard.tsx
  - components/dashboard/nuevo-turno-form.tsx
---

# "Salir sin guardar" deja la sección vieja en la pila

Dos fallos de la **UAT en celular** del quick `261006-flm` (2026-10-06). **Los dos son el mismo
defecto**, visto desde dos recorridos.

## El defecto

**Punto 6 del dueño, textual:** *"Salí con cambios sin guardar de Agenda hacia Finanzas, puse salir
sin guardar, me mandó a Finanzas, puse atrás y me mandó a Agenda, no a Dashboard."*

**Punto 3:** *"Salí sin guardar, me mandó al dashboard, toqué atrás y me mandó a turnos, que no tenía
nada que ver."*

**Causa, ya localizada:** `lib/unsaved-changes.ts:70-76` →
```ts
if (input.holdsSentinel) return 'replace'
```
Reemplaza **sobre el centinela**, así que la entrada de la sección que dejás (`/agenda`) **queda
intacta abajo**:

```
[… , /dashboard, /agenda, /agenda#sin-guardar]   ← sucio
→ replace sobre el centinela
[… , /dashboard, /agenda, /finances]             ← el atrás cae en /agenda  ✗
```

Lo que NAV-07 promete es `[…, /dashboard, /finances]`.

⚠ **Esto estaba declarado como límite aceptado** en el SUMMARY de `261006-flm` (*"con sentinel y regla
`replace` quedan dos secciones encima del dashboard"*). **El dueño lo rechazó en la UAT**, y tiene
razón: NAV-07 existe justamente para que el atrás caiga en el dashboard.

## La salida, que YA estaba medida

El diagnóstico de `.planning/debug/interceptar-atras-aviso-sin-guardar.md` probó cuatro variantes de
continuación y marcó **dos** como limpias. Se eligió la más simple (**Q4-D**, `replace` sobre el
centinela) y es la que resultó insuficiente. La que corresponde es **Q4-C**: **consumir el centinela y
recién entonces reemplazar**, así el `replace` cae sobre la entrada de la **sección** y no sobre el
centinela.

⚠ **`history.back()` es ASÍNCRONO**: el mismo diagnóstico midió que encadenar en el mismo tick
**pierde el push** (variante Q4-B, el destino nunca ocurre). Hay que encadenar **por el `popstate` del
consumo**, que es exactamente el patrón de dos pasos que `261006-flm` ya implementó para el camino del
atrás. **Reusalo, no inventes otro.**

## Task 1 — La continuación consume antes de reemplazar

- `leaveNavigationMode` deja de decidir sólo `'replace'` con centinela: tiene que poder expresar
  **"consumir y después aplicar el modo de sección"**. Mantenela **pura y testeada**.
- El modo de sección sigue saliendo de `panelNavMode({from, to})` — la misma regla del `<Link>` del
  sidebar. Con centinela **y** sección→sección, el resultado observable tiene que ser
  `[…, /dashboard, /destino]`.
- ⚠ **El caso sin destino** (salir por el atrás, donde el `popstate` no trae `href`) ya existe y
  funciona: **no lo rompas**. Es el punto 3 de la UAT del dueño.
- ⚠ **Re-verificar la marca antes de cada `back()`** (la guarda que ya tiene el módulo): si una
  escritura ajena pisó el state, **no** se hace `back()`.

## Task 2 — Medir el punto 3 antes de darlo por arreglado

El punto 3 **puede** ser consecuencia del mismo defecto, o puede ser otro. **Medí la pila real** en los
dos recorridos antes de cerrar:

1. `/appointments` → menú → `/agenda` → ensuciar → atrás → "Salir sin guardar" → ¿dónde cae? → atrás
   otra vez → ¿dónde cae?
2. El del punto 6, con destino por link.

⚠ Si el punto 3 **no** se arregla con el Task 1, **decilo** en vez de forzarlo: puede ser que la regla
`sección → sección = replace` no se haya aplicado al entrar a Agenda, y entonces el problema está
antes, no en la salida.

**Cómo medir:** el molde está en las sesiones de debug del workstream — Chrome headless + CDP con
`Page.getNavigationHistory`, que devuelve las entradas **con el índice actual** (es lo que resolvió el
bug de la ficha sepultada). El historial falso de los tests **no sirve** para esto: su `back()` hace
`pop()` y el navegador real **mueve el puntero sin borrar**.

## Task 3 — El calendario se pierde abajo de la pantalla

Pedido del dueño en el punto 8: *"me gustaría que al desplegar el calendario haya un scroll hasta el
final del calendario, sino se pierde en la pantalla"*.

- Al abrir el campo Fecha en `nuevo-turno-form.tsx`, llevar el calendario **a la vista** dentro del
  contenedor que ya scrollea.
- ⚠ **No uses `scrollIntoView` a secas sobre el documento**: el calendario vive dentro del
  `overflow-y-auto` del drawer, y un scroll del documento pelearía con el bloqueo de scroll del modal.
  Scrolleá **el contenedor**.
- ⚠ **Respetá `prefers-reduced-motion`** si usás scroll suave (regla del proyecto).
- ⚠ **No toques `dateOpen` ni su cableado de historial** (quick `261006-fln`, recién verificado): esto
  es sólo llevar la vista.
- **Cero cambio visual** fuera del scroll.

## Prohibiciones

- **No** toques `lib/overlay-history.ts`, `lib/dirty-history.ts` ni `resetDrawerDrag`.
- **No** cambies la copy del diálogo ni del indicador.
- **Cero paquetes nuevos**, **cero migraciones** (siguen **41**).

## Verificación

- `./node_modules/.bin/tsc --noEmit` — ⚠ **nunca `npx tsc`**. Buscá `error TS` en la SALIDA, filtrando
  `^\.next/`.
- `npx vitest run` — piso **1602 passed / 103 archivos**. ⚠ **Dos canarios de reloj fallan a propósito
  fuera de `[01:00, 23:30]` AR** y lo anuncian: **mirá el reloj** y aclaralo si aplica.
- `./node_modules/.bin/eslint <archivos>` → 0 problemas nuevos (hay **1 preexistente** en
  `agenda-client.tsx`, `react-hooks/purity`).
- **Medí la pila** antes y después en los dos recorridos, con números.
- ⚠ El **CI está rojo por infraestructura**, no por código: los 34 archivos del carril de base no
  alcanzan el Supabase de **staging** (`seed: createUser falló: fetch failed`). El carril puro pasa
  (68/68). **No intentes arreglarlo** — es un tema de la instancia, no del repo.
- ⚠ Hay un **dev server en el puerto 80** que el dueño usa. **NO lo mates** (corre desacoplado).

## UAT (celular)

1. Agenda → ensuciar → menú → **Finanzas** → "Salir sin guardar" ⇒ va a Finanzas, y el atrás cae en el
   **dashboard**. ← el fallo del punto 6
2. Entrar a Agenda desde otra sección, ensuciar, **atrás**, "Salir sin guardar" ⇒ y el atrás siguiente
   **no** cae en una sección que no tenga nada que ver. ← el fallo del punto 3
3. Lo de siempre que no se puede romper: avisar y no salir · "Seguir editando" y volver a avisar ·
   guardar y salir sin preguntar · modal abierto ⇒ el atrás cierra el modal.
4. "Nuevo turno" → abrir **Fecha** ⇒ el calendario **se ve entero**, sin tener que scrollear a mano.
