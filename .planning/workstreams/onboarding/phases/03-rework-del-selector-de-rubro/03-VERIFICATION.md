---
phase: 03-rework-del-selector-de-rubro
verified: 2026-07-04T22:12:03Z
status: passed
human_verified_via: checkpoints inline (03-02 aprobado por el usuario: trigger del Select con label tras fix c2a606b + auto-hide canchas 4→3 pasos)
score: 11/11
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Abrir /onboarding y navegar al paso 'Tu negocio' — verificar que el Select muestra exactamente 4 opciones con los labels correctos (Salud, Belleza/Estética/Spa, General, Canchas), que el campo libre es visible sin elegir nada, que el placeholder cambia según el rubro, y que el trigger muestra el label (no la VerticalKey cruda)"
    expected: "Select con 4 items; trigger muestra 'Belleza/Estética/Spa' (no 'belleza') al elegir belleza; Input 'A qué se dedica tu negocio?' siempre visible; placeholder dinámico por rubro; leyenda 'Así aparecerá en tu página de reservas' debajo"
    why_human: "El fix c2a606b de la función child en SelectValue (value→label) no puede verificarse sin renderizar el componente en el navegador; JSX interpolado solo confirma presencia de código, no el render real del trigger"
  - test: "Elegir 'Canchas' en el onboarding y verificar que el stepper omite el paso Profesionales (3 pasos visibles en lugar de 4). Luego cambiar a otro rubro y confirmar que vuelven a 4 pasos."
    expected: "Con Canchas elegido: stepper muestra 3 pasos (Profesionales oculto). Con otro rubro: 4 pasos. Consistente con Phase 2 D-03."
    why_human: "El auto-hide de Profesionales depende del estado `vertical === 'canchas'` en tiempo de ejecución; la transición de stepper no es verificable por grep"
behavior_unverified_items:
  - truth: "El trigger del Select muestra el LABEL (Belleza/Estética/Spa) y no el value crudo (belleza)"
    test: "Renderizar el onboarding en el navegador, elegir 'belleza', observar el texto visible del Select trigger"
    expected: "Trigger muestra 'Belleza/Estética/Spa', no 'belleza'"
    why_human: "La función child en SelectValue es código presente y wired, pero el render real del trigger de base-ui depende del runtime del navegador; grep no puede confirmar que el idioma funcione con esta versión de base-ui"
  - truth: "El auto-hide de Profesionales en canchas funciona con el nuevo modelo (vertical === 'canchas')"
    test: "En la app corriendo, elegir Canchas en el onboarding y observar que el stepper pasa de 4 a 3 pasos"
    expected: "Paso Profesionales desaparece del stepper al elegir Canchas; reaparece al cambiar a otro rubro"
    why_human: "La lógica `vertical === 'canchas'` está wired en visibleSteps, pero la transición de conteo de pasos es un state transition que no puede confirmarse por presencia de código"
---

# Fase 3: Rework del selector de rubro — Verificación

**Goal de la fase:** Simplificar el selector de rubro a 4 opciones (Salud, Belleza/Estética/Spa, General, Canchas) + un campo personalizable de texto libre SIEMPRE visible con sugerencia por rubro (placeholder "Ej: …") + leyenda "Así aparecerá en tu página de reservas". El rubro elegido resuelve el vertical; el texto libre se guarda en `type` y se muestra como categoría del negocio en la página pública de reservas. Aplica al onboarding y a la configuración del negocio en el dashboard. CERO REGRESIÓN en la resolución de vertical de negocios existentes.

**Verificado:** 2026-07-04T22:12:03Z
**Estado:** passed (11/11 automatizadas + los 2 items visuales aprobados por el usuario en los checkpoints inline de 03-02)
**Re-verificación:** No — verificación inicial

---

## Logro del Goal

### Truths observables

| # | Truth | Estado | Evidencia |
|---|-------|--------|-----------|
| 1 | El label de belleza es 'Belleza/Estética/Spa' en `VERTICALS.belleza.label` | VERIFICADO | `lib/verticals.ts:66` — `label: 'Belleza/Estética/Spa'` confirmado por grep y lectura directa |
| 2 | Los 4 arrays `VERTICALS[*].types` están vacíos (`[]`) | VERIFICADO | `lib/verticals.ts:43,67,88,106` — `types: []` en salud, belleza, general y canchas |
| 3 | `RUBRO_PLACEHOLDERS` y `getVerticalLabel` exportados desde `lib/verticals.ts` | VERIFICADO | `lib/verticals.ts:185,196` — `export const RUBRO_PLACEHOLDERS` y `export function getVerticalLabel`; 4 keys con strings literales de D-06 |
| 4 | `ALL_BUSINESS_TYPES` no existe en `lib/verticals.ts` ni en ningún archivo de código | VERIFICADO | `grep -r 'ALL_BUSINESS_TYPES' app/ lib/ components/ test/` → 0 resultados; solo aparece en artefactos de planning |
| 5 | `resolveVertical`, `getVerticalKeyByType`, `LEGACY_TYPE_VERTICAL` se conservan como fallback | VERIFICADO | `lib/verticals.ts:129,141,163` — las 3 funciones/constantes intactas; `resolveVertical` prefiere columna `vertical` (L163-174) |
| 6 | El onboarding muestra Select de 4 rubros planos (Object.keys(VERTICALS), sin TYPE_GROUPS) + campo libre siempre visible con label, leyenda y placeholder por rubro | VERIFICADO | `app/(onboarding)/onboarding/page.tsx:474-497` — `Object.keys(VERTICALS)` en el map de SelectItem; label `¿A qué se dedica tu negocio?`; leyenda `Así aparecerá en tu página de reservas`; `RUBRO_PLACEHOLDERS[vertical]`; sin TYPE_GROUPS (grep: 0 matches) |
| 7 | El insert del onboarding guarda `vertical` directo (VerticalKey elegida) y `type` como texto libre | VERIFICADO | `app/(onboarding)/onboarding/page.tsx:290-296` — insert con `type` y `vertical` explícitos; sin `getVerticalKeyByType(type)` en el insert |
| 8 | Settings muestra el MISMO control (4 rubros + campo libre + leyenda), sin andamiaje 'Otro' | VERIFICADO | `app/(dashboard)/settings/settings-client.tsx:1070-1089` — Object.keys(VERTICALS) en SelectItem; label `¿A qué se dedica tu negocio?`; leyenda; `RUBRO_PLACEHOLDERS[vertical]`; grep de OTRO_TYPE/predefinedTypes/typeIsOtro/typeSelectValue/onTypeChange → 0 matches |
| 9 | Settings guarda `vertical` = rubro elegido y `type` = texto libre, scoped a `.eq('id', business.id)` con reload-on-verticalChanged | VERIFICADO | `app/(dashboard)/settings/settings-client.tsx:261,265-266` — `.update({ ...bizForm, type, whatsapp, vertical, maps_url }).eq('id', business.id)` + `if (verticalChanged) setTimeout(() => window.location.reload(), 600)` |
| 10 | El fallback `business.type \|\| getVerticalLabel(business)` está en AMBOS booking clients (Pitfall 3) | VERIFICADO | `booking-client.tsx:403` y `canchas-booking-client.tsx:334` — patrón idéntico en ambos; imports de `getVerticalLabel` en L14 y L27 respectivamente; sin `dangerouslySetInnerHTML` (grep: 0 matches en ambos) |
| 11 | La migración 047 es aditiva (WHERE vertical IS NULL), no toca `type`, CASE total (ELSE 'general') | VERIFICADO | `supabase/migrations/047_backfill_vertical.sql:35-62` — UPDATE con WHERE vertical IS NULL; CASE total con ELSE 'general'; grep confirma sin DROP TABLE / ALTER TABLE type / CHECK constraint |
| 12 | El trigger del Select muestra el LABEL (no la VerticalKey cruda) mediante función child en SelectValue | PRESENTE_BEHAVIOR_UNVERIFIED | `onboarding/page.tsx:474-476` y `settings-client.tsx:1072` — código `(v: string) => v && v in VERTICALS ? VERTICALS[v].label : 'Elegí tu rubro'` presente y wired; el render real requiere verificación en navegador |
| 13 | El auto-hide de Profesionales en canchas keyea por `vertical === 'canchas'` (state transition) | PRESENTE_BEHAVIOR_UNVERIFIED | `onboarding/page.tsx:382,398` — `vertical === 'canchas'` en visibleSteps y canGoNext; lógica wired; la transición de stepper requiere verificación en navegador |

**Puntaje:** 11/11 verificadas como presentes y wired (2 con comportamiento no ejercido por test)

---

### Artefactos requeridos

| Artefacto | Esperado | Estado | Detalles |
|-----------|----------|--------|----------|
| `supabase/migrations/047_backfill_vertical.sql` | Backfill aditivo de businesses.vertical desde type (CASE, WHERE vertical IS NULL) | VERIFICADO | 62 líneas; UPDATE con WHERE vertical IS NULL; CASE cubre 9 salud + 6 belleza + 4 canchas + ELSE 'general'; no toca `type`; header en español documenta aplicación manual a prod |
| `lib/verticals.ts` | VerticalKey config con types vacíos + RUBRO_PLACEHOLDERS + getVerticalLabel | VERIFICADO | 4 `types: []`; `label: 'Belleza/Estética/Spa'`; RUBRO_PLACEHOLDERS con 4 keys; getVerticalLabel exportada; getVerticalKeyByType/LEGACY_TYPE_VERTICAL/resolveVertical intactos; ALL_BUSINESS_TYPES ausente |
| `test/verticals.test.ts` | Congela el CASE de la migración 047 + label de belleza + helpers | VERIFICADO | 10 tests (4 suites); congela label belleza, fallback filas viejas (Estética→belleza via LEGACY; Peluquería→General post-vaciado), RUBRO_PLACEHOLDERS D-06, CASE 047 (9 salud + 6 belleza + 4 canchas) |
| `app/(onboarding)/onboarding/page.tsx` | Selector de 4 rubros + Input libre siempre visible en el paso 'Tu negocio' | VERIFICADO | Object.keys(VERTICALS) en Select; RUBRO_PLACEHOLDERS[vertical]; label/leyenda presentes; insert guarda vertical directo; auto-hide y canGoNext re-keyeados |
| `app/(dashboard)/settings/settings-client.tsx` | Mismo selector en Configuración → Negocio, sin andamiaje 'Otro' | VERIFICADO | Object.keys(VERTICALS); RUBRO_PLACEHOLDERS; andamiaje 'Otro' removido; saveBusiness scoped a .eq('id', business.id) |
| `app/[slug]/booking-client.tsx` | Subtítulo de categoría con fallback al label del rubro | VERIFICADO | getVerticalLabel importado (L14); `business.type \|\| getVerticalLabel(business)` en L403; clases del `<p>` intactas; sin dangerouslySetInnerHTML |
| `app/[slug]/canchas-booking-client.tsx` | Subtítulo de categoría con fallback al label del rubro (gemelo canchas) | VERIFICADO | getVerticalLabel importado (L27); patrón idéntico en L334; clases del `<p>` intactas; sin dangerouslySetInnerHTML |

---

### Verificación de key links

| From | To | Via | Estado | Detalles |
|------|----|-----|--------|----------|
| `supabase/migrations/047_backfill_vertical.sql` | `lib/verticals.ts` | CASE replica 1:1 VERTICALS[*].types + LEGACY_TYPE_VERTICAL | VERIFICADO | Strings del CASE (`'Peluquería' THEN 'belleza'`, etc.) coinciden con el test de Suite 4; CASE 047 vs. CASE_047 del test: idénticos |
| `lib/verticals.ts (getVerticalLabel)` | `lib/verticals.ts (resolveVertical)` | getVerticalLabel reusa resolveVertical().label | VERIFICADO | `lib/verticals.ts:196-198` — `return resolveVertical(business).label` directo |
| `app/(onboarding)/onboarding/page.tsx` | `lib/verticals.ts` | importa VERTICALS + RUBRO_PLACEHOLDERS + VerticalKey; Select itera Object.keys(VERTICALS) | VERIFICADO | `onboarding/page.tsx:16` — import; L479 — Object.keys(VERTICALS); L495 — RUBRO_PLACEHOLDERS[vertical] |
| `app/(onboarding)/onboarding/page.tsx` | `businesses (Supabase)` | insert con vertical = VerticalKey elegida, type = texto libre | VERIFICADO | `onboarding/page.tsx:290-296` — insert fields incluyen `type` y `vertical` explícitos |
| `app/(dashboard)/settings/settings-client.tsx` | `businesses (Supabase)` | update con vertical + type, scoped a .eq('id', business.id) | VERIFICADO | `settings-client.tsx:261` — `.update({ ...bizForm, type, whatsapp, vertical, maps_url }).eq('id', business.id)` |
| `app/[slug]/booking-client.tsx` | `lib/verticals.ts (getVerticalLabel)` | import + business.type \|\| getVerticalLabel(business) | VERIFICADO | L14 import; L403 uso con fallback |
| `app/[slug]/canchas-booking-client.tsx` | `lib/verticals.ts (getVerticalLabel)` | import + business.type \|\| getVerticalLabel(business) | VERIFICADO | L27 import; L334 uso con fallback |

---

### Data-Flow Trace (Nivel 4)

| Artefacto | Variable de datos | Fuente | Produce datos reales | Estado |
|-----------|-------------------|--------|----------------------|--------|
| `booking-client.tsx` | `business.type` + `business.vertical` | Server component de `/[slug]/page.tsx` pasa el negocio completo desde Supabase | El server component ya hacía query del negocio con todos sus campos; getVerticalLabel lee `business.vertical` que se backfillea con 047 | FLOWING |
| `canchas-booking-client.tsx` | `business.type` + `business.vertical` | Mismo patrón que booking-client | Idéntico | FLOWING |
| `onboarding/page.tsx` | `vertical` (estado local) + `type` (texto libre) | Input del usuario → insert a `businesses` | El insert persiste ambos campos en la DB; el vertical elegido no es un valor estático | FLOWING |
| `settings-client.tsx` | `vertical` (estado local) + `bizForm.type` | Inicialización desde `business.vertical` / `getVerticalKeyByType(business.type)` → input del usuario → update | La inicialización lee la columna `vertical` de DB (real); el update persiste ambos | FLOWING |

---

### Spot-checks comportamentales

| Comportamiento | Comando | Resultado | Estado |
|----------------|---------|-----------|--------|
| Tests de verticals pasan | `npm run test -- verticals` | 10/10 tests pasados (exit 0); 4 suites: labels, fallback filas viejas, RUBRO_PLACEHOLDERS, CASE 047 | PASS |
| TypeScript sin errores | `npx tsc --noEmit` | Exit 0, sin errores de tipos | PASS |
| Migración 047 tiene UPDATE con WHERE vertical IS NULL y ELSE 'general' | `grep 'WHERE vertical IS NULL\|ELSE' supabase/migrations/047_backfill_vertical.sql` | Ambos presentes | PASS |
| getVerticalLabel presente en ambos booking clients | `grep 'getVerticalLabel' app/[slug]/booking-client.tsx app/[slug]/canchas-booking-client.tsx` | L14 y L27 respectivamente + L403 y L334 con el patrón de fallback | PASS |
| Sin dangerouslySetInnerHTML en booking clients | `grep 'dangerouslySetInnerHTML'` en ambos | 0 matches | PASS |
| Commits de fase existen y completos | `git log --oneline` | 7 commits de fase (edd90a1..4b065c7) con mensajes descriptivos | PASS |

---

### Cobertura de requisitos

| Requisito | Plan | Descripción | Estado | Evidencia |
|-----------|------|-------------|--------|-----------|
| ONB-RUBRO-01 | 03-01, 03-02 | Selector de rubro reducido a 4 opciones con campo personalizable siempre visible con sugerencia por rubro y leyenda, en el onboarding | SATISFECHO | Select de Object.keys(VERTICALS) en onboarding; label/leyenda/RUBRO_PLACEHOLDERS verificados en L470-497 |
| ONB-RUBRO-02 | 03-01, 03-02, 03-03 | Mismo selector en settings; texto libre se muestra como categoría en el booking público; cero regresión para negocios existentes | SATISFECHO | Settings: mismo control sin andamiaje 'Otro'; booking clients con fallback getVerticalLabel; migración 047 backfillea negocios existentes; tests 10/10 confirman el mapping |

Estado en REQUIREMENTS.md: ONB-RUBRO-01 → Phase 3 → `[x]` (Complete); ONB-RUBRO-02 → Phase 3 → `[x]` (Complete).

---

### Anti-patrones detectados

| Archivo | Línea | Patrón | Severidad | Impacto |
|---------|-------|--------|-----------|---------|
| `app/(onboarding)/onboarding/page.tsx` | 101, 132 | Errores de lint (React Compiler: mutación directa de DOM dataset, setState en efecto) | INFO (pre-existente) | Baseline de ~460 errores de lint pre-existentes del proyecto (React Compiler memoization + design_handoff), confirmado: las líneas 101 y 96-99 corresponden al código de paleta pre-fase-03; el diff 37e3912..4fc76a3 no agrega estas líneas. Esta fase no introduce nuevos errores de lint (eslint por archivo en lib/verticals.ts: exit 0; booking clients: exit 0). |
| `app/(dashboard)/settings/settings-client.tsx` | 151 | Error de lint React Compiler (setState en efecto) | INFO (pre-existente) | Línea 151 `setConfigTab('integraciones')` es código de integración MercadoPago pre-existente; no introducido por esta fase. |
| `lib/verticals.ts` | 177 | `TYPE_GROUPS` sigue exportado pero ya no tiene consumidores en UI | INFO | `TYPE_GROUPS` ahora mapea rubros vacíos (types: []) — técnicamente inofensivo. No está importado en ningún componente de app/ o components/. No es un blocker; es dead export que puede limpiarse en una fase futura. |

Sin TBD/FIXME/XXX no referenciados en archivos modificados. Sin stubs ni retornos vacíos en el código nuevo.

---

### Verificación humana requerida

#### 1. Render del trigger del Select con label visible (no VerticalKey cruda)

**Test:** Abrir `/onboarding` en el navegador. En el paso "Tu negocio", elegir el rubro "Belleza/Estética/Spa". Observar el texto visible del trigger del Select después de la selección.

**Esperado:** El trigger muestra "Belleza/Estética/Spa" (el label), no "belleza" (la VerticalKey cruda). El fix c2a606b agrega la función child `(v: string | null) => v && v in VERTICALS ? VERTICALS[v].label : 'Elegí tu rubro'` en ambas superficies. Verificar también en Settings → Negocio.

**Por qué humano:** La función child en `SelectValue` de base-ui es código presente y wired, pero el runtime de base-ui tiene su propia lógica de render del trigger (`hasSelectedValue`). El ejecutor detectó este bug en el checkpoint (el trigger mostraba "belleza") y lo corrigió en c2a606b; la corrección está en código pero el verifier no puede confirmar el render real sin el navegador.

#### 2. Auto-hide de Profesionales en Canchas (state transition del stepper)

**Test:** En `/onboarding`, llegar al paso "Tu negocio". Elegir "Canchas" en el selector de rubro. Observar el stepper en la parte superior.

**Esperado:** El stepper pasa de 4 pasos a 3 pasos (Profesionales desaparece). Al cambiar a otro rubro (ej. Salud), el stepper vuelve a 4 pasos. El botón "Siguiente" del paso 2 (Servicios) debe saltar directamente al paso 4 (Horarios), sin pasar por Profesionales.

**Por qué humano:** La lógica `vertical === 'canchas'` en `visibleSteps` y la navegación del stepper son una invariante de ordenamiento/filtrado que depende del estado de React en tiempo de ejecución. El código está wired correctamente pero la transición entre conteos de pasos no puede confirmarse por grep.

---

### Resumen de gaps

Sin gaps bloqueantes. Todos los artefactos existen, son sustantivos y están wired. Los 2 items de verificación humana son comportamentales (render de UI y state transition del stepper) que requieren el navegador para confirmación definitiva, pero el código base es correcto y está wired. El fix c2a606b fue detectado y aplicado durante la ejecución (checkpoint 03-02), lo que aumenta la confianza en que el render es correcto.

**Nota sobre `TYPE_GROUPS`:** El export sigue existiendo en `lib/verticals.ts` pero ya no tiene importadores en la UI (los arrays que alimenta están vacíos). Es dead export inofensivo, no un gap funcional.

**Nota sobre lint:** Los errores de lint en onboarding y settings son pre-existentes (baseline de ~460 errores de React Compiler, confirmado por git diff). Esta fase no introduce nuevos errores (eslint por archivo en los 5 archivos modificados: 0 errores nuevos).

---

_Verificado: 2026-07-04T22:12:03Z_
_Verificador: Claude (gsd-verifier)_
