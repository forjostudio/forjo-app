---
quick_id: 260928-hby
slug: la-zona-sin-categoria-del-organizador-de
date: 2026-09-28
type: quick
surface: panel (Phase 23 — cerrada; esto NO la replanifica, es un fix acotado)
files_modified:
  - components/dashboard/categorias-manager.tsx
  - test/catalog-panel.test.ts
---

# La zona "Sin categoría" del organizador se muestra siempre que haya categorías

## De dónde sale

Encontrado por el dueño durante la UAT de la Phase 24 (Test 18), probando en `/servicios` con
3 categorías y 0 servicios sueltos.

## El problema, medido

`components/dashboard/categorias-manager.tsx:916` gatea el grupo de los sueltos con
`sueltos.length > 0`. O sea: **la zona donde soltar un chip para desasignarlo sólo existe cuando ya
hay algo desasignado.** Para sacar el primer servicio de su categoría hay que abrir el diálogo
"Mover …" y elegir "Sin categoría" de una lista.

**El comentario de `:912-915` dice otra cosa que el código.** Justifica el gate así:

> *"Sólo con ≥1 categoría: con cero, todos son sueltos y el grupo sería el catálogo entero
> duplicado, sin ningún lugar a donde moverlo."*

Esa condición —**≥1 categoría**— es distinta de la implementada —**≥1 suelto**—, y divergen
exactamente en el caso del dueño: 3 categorías, 0 sueltos. La intención escrita dice mostrarlo.

## El arreglo

Cambiar la condición de `sueltos.length > 0` a `categories.length > 0`, que es **la que el
comentario ya declara**. `categories` está disponible en el scope (se usa en `:161`, `:238`, `:716`,
`:729`, `:744`).

Con eso el gate hace lo que dice: con cero categorías el grupo no se pinta (sería el catálogo entero
duplicado, sin destino posible); con al menos una, la zona punteada está siempre presente y se puede
arrastrar el primer chip afuera.

## Tareas

### Task 1 — La condición

**Acción:** en `components/dashboard/categorias-manager.tsx:916`, reemplazar la condición del render
del grupo de sueltos por `categories.length > 0`. Actualizar el comentario de `:912-915` para que
describa la condición real y **por qué** (el círculo vicioso del destino de arrastre), no sólo la
regla.

**Cuidados:**
- El contador (`serviceCountLabel(sueltos.length)`) tiene que seguir siendo correcto con 0 sueltos.
  Verificar qué texto produce con `0` y que no diga algo raro.
- El texto explicativo (*"Estos se reservan igual. En tu página aparecen al final, bajo 'Otros'"*)
  habla en presente de servicios que con 0 sueltos **no existen**. Con la zona vacía, ese copy miente.
  Ajustarlo para que sea verdadero en los dos estados, o mostrar copy distinto cuando está vacía.
- El `<ul>` de chips queda vacío: comprobar que no deja un hueco raro ni rompe el layout.
- **No tocar** nada del comportamiento de drag existente (`onDragOver`/`onDrop`/`chipDropIntent`):
  la regla de G-23-10a sobre el modo personalizado sigue igual.

**Verify:**
- `./node_modules/.bin/tsc --noEmit` (NUNCA `npx tsc`: siempre sale 0 en este repo) → sin `error TS`
- `npx eslint components/dashboard/categorias-manager.tsx` → rc=0

### Task 2 — El test que lo fija

**Acción:** sumar a `test/catalog-panel.test.ts` (o al archivo de tests que corresponda al
organizador) un caso que afirme la condición nueva: **con ≥1 categoría la zona se renderiza aunque
no haya sueltos**, y **con 0 categorías no**. El entorno de Vitest es `node` (sin jsdom), así que
seguir el molde de gates por lectura de fuente que ya usa el repo.

**Verify:**
- `npx vitest run` → piso **1359 passed / 97 files** (medido 2026-09-28), más los casos nuevos
- ⚠ Dos canarios de reloj (`service-delete-gate`, `capacity-mode-change-gate`) fallan **a propósito**
  fuera de `[01:00, 23:30]` AR. Si aparecen rojos, mirar la hora antes de culpar al cambio.
- `ls supabase/migrations/*.sql | wc -l` → **41**. Cero paquetes nuevos.

## Fuera de alcance

- Cualquier otro cambio del organizador o de la Phase 23.
- El arrastre táctil en mobile (follow-up diferido conocido del repo).
