---
phase: 01-vertical-canchas
plan: 01
subsystem: verticales
tags: [verticals, dashboard, terminology, menu, guard, canchas]
status: complete
requires:
  - "lib/verticals.ts (sistema de verticales existente: VERTICALS, resolveVertical, getVerticalKeyByType, TYPE_GROUPS)"
  - "businesses.vertical (columna ya existente, bajo RLS por business_id — motor v0.12)"
provides:
  - "VerticalKey 'canchas' de primera clase + VERTICALS.canchas (terminologia Reserva/Cancha/Sede, menu sin Equipo)"
  - "getVertical('Cancha de fútbol').key === 'canchas' (cutover del override → vertical nativo)"
  - "Guard server-side en /equipo que redirige a /dashboard para negocios canchas"
affects:
  - "components/dashboard/sidebar.tsx (deriva menu+terminology de VERTICALS — agarra canchas solo)"
  - "app/(dashboard)/settings/settings-client.tsx y app/(onboarding)/onboarding/page.tsx (TYPE_GROUPS gana grupo 'Canchas')"
  - "lib/landing/seo.ts (Record<VerticalKey> exhaustivos: nueva entrada canchas)"
tech-stack:
  added: []
  patterns:
    - "Vertical de primera clase: terminologia/menu declarativos en VERTICALS, derivados automaticamente por TYPE_GROUPS/ALL_BUSINESS_TYPES/sidebar"
    - "Guard server-side de pagina: resolveVertical(business).key check ANTES de las queries (fail-closed contra leak de UI)"
key-files:
  created: []
  modified:
    - "lib/verticals.ts"
    - "lib/landing/seo.ts"
    - "app/(dashboard)/equipo/page.tsx"
decisions:
  - "types de canchas (Claude's Discretion): fútbol/pádel/tenis/básquet + 'Otro' — deportes más comunes en AR, 'Otro' consistente con general"
  - "@type schema.org para canchas = 'SportsActivityLocation' (lib/landing/seo.ts); description template = 'Reservá tu cancha online en {name}.'"
  - "Removal total de TYPE_TERMINOLOGY_OVERRIDE (no Record vacío) — D-06 / Claude's Discretion"
metrics:
  duration: "~7 min"
  completed: "2026-06-30"
  tasks: 3
  files: 3
---

# Phase 1 Plan 01: Vertical Canchas (scaffolding) Summary

Agregado el rubro **canchas** como `VerticalKey` de primera clase con terminología propia
("Reserva/Cancha/Sede", D-04) y menú sin "Equipo" (D-02), eliminado el `TYPE_TERMINOLOGY_OVERRIDE`
legacy (D-06), y blindado `/equipo` con un guard server-side que redirige los negocios canchas
a `/dashboard` antes de cualquier query (D-05) — todo declarativo y framework-agnóstico, con cero
regresión en salud/belleza/general (D-07).

## Qué se construyó

- **Task 1 (`4c10be6`)** — `VerticalKey` extendido a `'salud' | 'belleza' | 'general' | 'canchas'`;
  entrada `VERTICALS.canchas` completa (label 'Canchas'; types fútbol/pádel/tenis/básquet/Otro;
  terminology Reserva/Cancha/Sede; menu sin `equipo`/`patients`; features `{}`). Removido
  `'Cancha de fútbol'` de `general.types`. Comentario de `resource`/`resources` actualizado para no
  nombrar el override (que se elimina en Task 2).
- **Task 2 (`71e7659`)** — Borrada la constante `TYPE_TERMINOLOGY_OVERRIDE` entera y simplificadas
  `getVertical`/`resolveVertical`: la `terminology` sale directa del `VerticalConfig`, sin el spread
  `...(override ?? {})`. Prioridad de `resolveVertical` (stored vertical → fallback por type) y firmas
  exportadas sin cambios.
- **Task 3 (`b1da724`)** — `app/(dashboard)/equipo/page.tsx`: import de `resolveVertical` + guard
  `if (resolveVertical(business).key === 'canchas') redirect('/dashboard')`, insertado tras
  `if (!business) redirect('/onboarding')` y ANTES del `Promise.all` de professionals/spaces.

## Derivaciones automáticas (sin tocar su definición)

- `TYPE_GROUPS` gana el grupo "Canchas" → aparece en el select de onboarding/settings.
- `ALL_BUSINESS_TYPES` gana los types de canchas (sugerencia de rubro por IA).
- `getVerticalKeyByType('Cancha de fútbol')` ahora devuelve `'canchas'` (antes `'general'`).
- El sidebar deriva menu+terminology de `VERTICALS` → un negocio canchas no renderiza "Equipo".

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Record<VerticalKey> exhaustivos en lib/landing/seo.ts exigían la clave 'canchas'**
- **Encontrado durante:** Task 1 (al correr `npx tsc --noEmit`).
- **Issue:** Extender el union `VerticalKey` con `'canchas'` rompió la compilación: dos
  `Record<VerticalKey, ...>` en `lib/landing/seo.ts` (`SCHEMA_TYPE_BY_VERTICAL` y
  `DESCRIPTION_TEMPLATE_BY_VERTICAL`) quedaron incompletos (TS2741). Ambos tenían fallback en runtime
  (`?? 'LocalBusiness'` / template por defecto), pero TS exige la clave literal.
- **Fix:** Agregadas las entradas `canchas` coherentes con el rubro: `@type` schema.org
  `'SportsActivityLocation'` y description template `'Reservá tu cancha online en {name}.'`.
- **Archivos modificados:** `lib/landing/seo.ts` (commiteado junto a Task 1, `4c10be6`).
- **Scope:** Eran los únicos dos Records exhaustivos sobre `VerticalKey` en el repo (verificado con grep).

## Cutover de datos (follow-up — NO ejecutado en esta fase)

El plan es **solo-código**. Un negocio preexistente con `type='Cancha de fútbol'` y
`vertical='general'` almacenado **regresaría** tras este cambio (porque `resolveVertical` prioriza el
vertical stored 'general', no el type). CONTEXT D-06 lo prevé con un one-liner de datos:

```sql
UPDATE businesses SET vertical = 'canchas' WHERE type = 'Cancha de fútbol';
```

**No se ejecutó** (es dato, no código; prod no tiene clientes — D-06). **Debe correrse en cualquier
DB dev/staging** que tenga filas con `type='Cancha de fútbol'` para que esos negocios adopten el
nuevo vertical. El orquestador debería verificarlo al cierre de fase.

## Known Stubs

Ninguno. El cambio es presentación/resolución de vertical, sin datos mock ni placeholders.

## Threat Flags

Ninguno. Esta fase no introduce tablas, columnas, route handlers públicos ni cruces de tenant nuevos.
El único vector con sabor a seguridad (leak de UI de /equipo en canchas, T-01-01) queda mitigado por
el guard server-side de Task 3, que redirige antes de leer `professionals`/`spaces`.

## Verification

- `npx tsc --noEmit` → pasa (proyecto strict:true).
- `npm run lint` → los 3 archivos tocados pasan sin errores. El repo arrastra ~460 errores de lint
  pre-existentes en archivos NO tocados por esta fase (registrados en `deferred-items.md`,
  confirmados contra `git diff HEAD~1`).
- `grep -rn TYPE_TERMINOLOGY_OVERRIDE lib app components` → 0 referencias vivas.
- No-regresión: `salud`/`belleza` sin diff en terminology/menu; `general` solo difiere en el removal
  de `'Cancha de fútbol'` de `types`; su menu sigue conteniendo `'equipo'` y su `resource` sigue
  siendo `'Profesional'`.
- `VERTICALS.canchas.menu` no contiene `'equipo'` ni `'patients'`.

## Self-Check: PASSED

- Commits verificados en `git log`: `4c10be6` (Task 1), `71e7659` (Task 2), `b1da724` (Task 3).
- Archivos modificados existen: `lib/verticals.ts`, `lib/landing/seo.ts`, `app/(dashboard)/equipo/page.tsx`.

## Pendiente human-check (fin de fase)

Con un negocio de prueba seteado a rubro Canchas (`vertical='canchas'`): (1) el sidebar NO muestra
"Equipo" y los labels dicen "Reservas"/"Canchas"; (2) escribir `/equipo` a mano redirige a
`/dashboard`. Con un negocio salud/general: (3) `/equipo` sigue mostrando la vista Equipo y el
sidebar mantiene menú+terminología de siempre.
