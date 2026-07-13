---
phase: 01-vertical-canchas
verified: 2026-06-30T21:00:00Z
status: passed
score: 4/4 must-haves verified
human_verification_result: passed (UAT 3/3, 2026-06-30 — usuario confirmó "funciona todo")
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Con un negocio de prueba seteado a rubro Canchas (vertical='canchas'), abrir el dashboard y verificar que el sidebar NO muestra el item 'Equipo', y que los labels de menú dicen 'Reservas' (Appointments) y que la terminología del rubro aparece correctamente."
    expected: "El sidebar de un negocio canchas omite el item Equipo. Los ítems visibles no incluyen 'Equipo' ni 'Profesionales'. Los labels de turnos dicen 'Reservas'."
    why_human: "buildNav deriva de v.menu — la lógica está verificada en código, pero el render visual del sidebar solo puede confirmarse corriendo la app."
  - test: "Con el mismo negocio canchas, escribir la URL /equipo a mano en el navegador."
    expected: "El navegador redirige a /dashboard sin mostrar ningún contenido de /equipo."
    why_human: "El guard server-side está verificado en código (línea 18 antes de Promise.all línea 22), pero la redirección real en el navegador requiere ejecución."
  - test: "Con un negocio de salud o general, verificar que /equipo sigue funcionando normal y el sidebar mantiene su menú y terminología sin cambios."
    expected: "El negocio salud/general muestra /equipo con la vista de Equipo/Profesionales de siempre. El sidebar no muestra ningún cambio respecto a antes del deploy."
    why_human: "La no-regresión está verificada en código (entradas salud/belleza/general byte-idénticas), pero la experiencia visual real requiere ejecución con datos reales."
---

# Phase 1: Vertical Canchas — Verification Report

**Phase Goal:** Que un negocio pueda operar como rubro "canchas": setea su tipo/vertical a canchas y el dashboard adopta su terminología y menú propios (eje de agenda = "Cancha", SIN el item "Profesionales/Equipo"), reutilizando y extendiendo el sistema de verticales existente (lib/verticals.ts + lib/use-terminology.tsx). Scaffolding del vertical: deja terminología/menú listos para fases siguientes, garantizando CERO regresión en salud/belleza/general y en negocios existentes.

**Verified:** 2026-06-30T21:00:00Z
**Status:** human_needed
**Re-verification:** No — verificación inicial

---

## Goal Achievement

### Observable Truths (Success Criteria del ROADMAP)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Un negocio puede setear su rubro a "canchas" y queda resuelto al vertical correcto con terminología propia (eje de agenda = "Cancha"/"Canchas") | VERIFIED | `VERTICALS.canchas` en lib/verticals.ts líneas 104-124: label='Canchas', terminology.appointment='Reserva', terminology.resource='Cancha', terminology.location='Sede'. `VerticalKey = 'salud' \| 'belleza' \| 'general' \| 'canchas'` (línea 5). `TYPE_GROUPS` y `ALL_BUSINESS_TYPES` derivan automáticamente de `VERTICALS` → aparecen en onboarding/settings sin cambios en esas pantallas. |
| 2 | El dashboard del rubro canchas NO muestra "Profesionales/Equipo" en el menú; la terminología visible es la del rubro | VERIFIED | `VERTICALS.canchas.menu` (línea 122): `['dashboard', 'appointments', 'agenda', 'clients', 'finances', 'servicios', 'consultorios', 'negocio', 'settings']` — sin 'equipo' ni 'patients'. Sidebar (components/dashboard/sidebar.tsx línea 50): `v.menu.map(key => ITEMS[key]).filter(Boolean)` — deriva directamente del menu del vertical. No es necesario tocar el sidebar. |
| 3 | Los verticales existentes (salud/belleza/general) y los negocios ya creados resuelven exactamente igual que antes — cero regresión visible | VERIFIED | lib/verticals.ts: salud.menu línea 58 incluye 'equipo' y 'patients' — intacto. belleza.menu línea 80 incluye 'equipo' — intacto. general.menu línea 101 incluye 'equipo' — intacto. Terminología de los tres verticales sin diff. El único cambio en general es el removal de 'Cancha de fútbol' de general.types (línea 88 — ausente, confirmado por grep). `getVerticalKeyByType('Cancha de fútbol')` ahora devuelve 'canchas' (antes 'general') — comportamiento correcto por diseño. |
| 4 | La resolución de vertical es determinística y sin estado roto: un negocio sin canchas nunca ve UI de canchas; uno de canchas nunca ve UI de profesionales | VERIFIED | `resolveVertical` (líneas 163-174): prioriza `business.vertical` almacenado; sin `override ?? {}` en ninguna rama. Guard server-side en app/(dashboard)/equipo/page.tsx línea 18: `if (resolveVertical(business).key === 'canchas') redirect('/dashboard')` — ubicado ANTES del Promise.all de professionals/spaces (línea 22). Import en línea 4: `import { resolveVertical } from '@/lib/verticals'`. |

**Score:** 4/4 truths verified

---

### Prohibitions Check

| Prohibition | Result | Evidence |
|-------------|--------|----------|
| VERTICALS.canchas.menu NO contiene 'equipo' ni 'patients' | PASS | Línea 122: menu array sin esas keys. Confirmado por grep (solo aparecen en salud/belleza/general con comentario explicativo en línea 121). |
| lib/verticals.ts NO contiene TYPE_TERMINOLOGY_OVERRIDE | PASS | grep -rn TYPE_TERMINOLOGY_OVERRIDE sobre lib/app/components: 0 resultados. Constante eliminada por completo (Task 2, commit 71e7659). |
| general.types NO contiene 'Cancha de fútbol' | PASS | general.types (línea 88): `['Estudio de tatuajes', 'Entrenador personal', 'Clases particulares', 'Lavadero de autos', 'Veterinaria', 'Taller mecánico', 'Estudio de fotografía', 'Otro']` — sin 'Cancha de fútbol'. El literal solo existe en canchas.types (línea 106). |
| Los menus y terminology de salud/belleza/general NO cambian | PASS | Entradas intactas. Solo diff en general.types (removal intencional). |
| lib/verticals.ts NO importa React ni iconos | PASS | grep de `from 'react'\|lucide-react\|import React` en lib/verticals.ts: 0 resultados. El archivo sigue siendo framework-agnóstico. |

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|---------|--------|---------|
| `lib/verticals.ts` | VerticalKey extendido con 'canchas' + entrada VERTICALS.canchas + removal de TYPE_TERMINOLOGY_OVERRIDE | VERIFIED | Línea 5: tipo extendido. Líneas 104-124: VERTICALS.canchas completo. TYPE_TERMINOLOGY_OVERRIDE: 0 referencias. getVertical y resolveVertical sin spread de override. |
| `app/(dashboard)/equipo/page.tsx` | Guard server-side: redirect a /dashboard si vertical canchas | VERIFIED | Línea 4: import resolveVertical. Línea 18: guard condicional. Línea 22: Promise.all DESPUÉS del guard. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `app/(dashboard)/layout.tsx` | `lib/verticals.ts` | `resolveVertical(business)` → `VerticalProvider` inyecta terminología de canchas a todo el dashboard | VERIFIED | layout.tsx líneas 8, 36-39: import + llamada + wrap en VerticalProvider. Pattern `resolveVertical` presente. |
| `components/dashboard/sidebar.tsx` | `lib/verticals.ts` | `buildNav` mapea `v.menu` (sin 'equipo') → sidebar de canchas no renderiza Equipo | VERIFIED | sidebar.tsx líneas 9, 35, 50: import + `const v = resolveVertical(business)` + `v.menu.map(key => ITEMS[key]).filter(Boolean)`. |
| `app/(dashboard)/equipo/page.tsx` | `lib/verticals.ts` | `resolveVertical(business).key === 'canchas'` → redirect('/dashboard') | VERIFIED | Línea 4 (import) + línea 18 (guard). Guard en línea 18, professionals query en línea 23 — orden correcto. |

---

### Behavioral Spot-Checks

TypeScript compilation verificada:

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Proyecto compila sin errores con VerticalKey extendido | `npx tsc --noEmit` | Exit 0, sin output | PASS |

Los tres archivos modificados (lib/verticals.ts, lib/landing/seo.ts, app/(dashboard)/equipo/page.tsx) compilan limpio en un proyecto con `strict: true`.

Step 7b: Behavioral checks en runtime (render del sidebar, redirección del guard) no son ejecutables sin servidor — ruteados a Human Verification.

---

### Requirements Coverage

| Requirement | Phase Plan | Description | Status | Evidence |
|-------------|-----------|-------------|--------|----------|
| VERT-01 | 01-01-PLAN.md | Un negocio puede setear su rubro a "canchas" y el dashboard adopta terminología y menú propios del vertical (sin "Profesionales/Equipo") | SATISFIED | VERTICALS.canchas completo (terminología + menú sin equipo). Derivación automática en TYPE_GROUPS → onboarding/settings. Sidebar deriva de v.menu. |
| VERT-02 | 01-01-PLAN.md | El vertical canchas resuelve sin romper los otros verticales (salud/belleza/general) ni los negocios existentes | SATISFIED | Entradas salud/belleza/general byte-idénticas (salvo removal intencional de 'Cancha de fútbol' en general.types). TYPE_TERMINOLOGY_OVERRIDE eliminado sin cambiar el comportamiento neto de los otros verticales. |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `lib/landing/seo.ts` | 98-101 | `buildMetadataParts`: la variable `verticalKey` solo narrow a `salud \| belleza \| general`; 'canchas' cae a 'general'. Resultado: un negocio canchas recibe la description template genérica (`'Reservá tu turno online en {name}.'`) en vez de la propia (`'Reservá tu cancha online en {name}.'`) | WARNING | Presentación SEO — el @type schema.org sí es correcto (SportsActivityLocation) porque `buildJsonLd` recibe `VerticalKey` tipado del caller. El template incorrecto en `buildMetadataParts` no afecta el core vertical (terminología/menú), pero la meta description de la landing de un negocio canchas no usa el copy del rubro. **Bug pre-existente en la lógica de narrowing** (introducido en commit 923678a, antes de que 'canchas' existiera como VerticalKey); esta fase añadió la entrada correcta en `DESCRIPTION_TEMPLATE_BY_VERTICAL` pero no actualizó el narrowing. |

No hay debt markers (TBD / FIXME / XXX) en ninguno de los tres archivos modificados.

---

### Desviación declarada: `lib/landing/seo.ts` (aceptable)

La fase tocó `lib/landing/seo.ts` como fix de compilacion (TS2741: Records exhaustivos que requerian la clave 'canchas'). El SUMMARY lo documenta correctamente. Los dos Records recibieron entradas coherentes:
- `SCHEMA_TYPE_BY_VERTICAL.canchas = 'SportsActivityLocation'` — CORRECTO y funcional (buildJsonLd usa este path).
- `DESCRIPTION_TEMPLATE_BY_VERTICAL.canchas = (name) => 'Reservá tu cancha online en ${name}.'` — CORRECTO en el Record, pero el narrowing de `buildMetadataParts` (líneas 98-101) no lo alcanza.

El fix de TS fue necesario y correcto; el bug del narrowing es deuda técnica que existía antes y que esta fase no introdujo ni agravó (el comportamiento anterior para 'Cancha de fútbol' también caía a 'general' en ese narrowing).

---

### Human Verification Required

#### 1. Sidebar canchas: sin "Equipo", con terminología propia

**Test:** Con un negocio de prueba cuyo `vertical='canchas'` (o type='Cancha de fútbol' sin vertical forzado), abrir el dashboard y revisar el sidebar.
**Expected:** El sidebar NO muestra el ítem "Equipo". Los ítems visibles no incluyen 'Equipo'. El label de Appointments muestra "Reservas".
**Why human:** buildNav y v.menu están verificados en código, pero el render visual del sidebar requiere ejecución. La terminología visible (label del ítem de appointments, etc.) depende de cómo el sidebar renderiza t.appointments.

#### 2. Guard /equipo → redirect en negocio canchas

**Test:** Con el mismo negocio canchas autenticado, escribir `/equipo` a mano en el navegador (o navegar directamente a la URL).
**Expected:** El navegador termina en `/dashboard` sin mostrar ningún contenido de la página de Equipo.
**Why human:** El guard está verificado estáticamente (línea 18 antes de Promise.all en línea 22), pero la redirección real en el navegador con sesión activa y `business.vertical='canchas'` requiere ejecución.

#### 3. No-regresión visual en salud/general

**Test:** Con un negocio de salud o general, verificar que (a) `/equipo` sigue mostrando la vista de Equipo/Profesionales sin cambios, y (b) el sidebar mantiene el menú y terminología de siempre.
**Expected:** Sin diferencia observable respecto al comportamiento anterior a la fase. El sidebar muestra "Equipo", la terminología del rubro es la misma.
**Why human:** La no-regresión está verificada en código (entradas byte-idénticas), pero la experiencia visual con datos reales requiere ejecución.

---

### Gaps Summary

No hay gaps que bloqueen el objetivo de la fase. Los 4 success criteria del ROADMAP están verificados en código. El status es `human_needed` porque los tres human-checks del PLAN (definidos como `<human-check>` en los tasks) requieren ejecución con un negocio de prueba para validar el render visual y la redirección.

El anti-patrón en `buildMetadataParts` es deuda técnica pre-existente (no regresión introducida por esta fase) con impacto limitado a SEO de la landing pública de canchas.

---

### Nota sobre el SQL de cutover de datos

El SUMMARY documenta correctamente que el cutover SQL:

```sql
UPDATE businesses SET vertical = 'canchas' WHERE type = 'Cancha de fútbol';
```

NO fue ejecutado (es dato, no código; no hay clientes en prod — D-06). Debe correrse en cualquier DB dev/staging que tenga filas con `type='Cancha de fútbol'` para que esos negocios adopten el nuevo vertical. No es un gap de fase: está documentado como follow-up deliberado.

---

_Verified: 2026-06-30T21:00:00Z_
_Verifier: Claude (gsd-verifier)_
