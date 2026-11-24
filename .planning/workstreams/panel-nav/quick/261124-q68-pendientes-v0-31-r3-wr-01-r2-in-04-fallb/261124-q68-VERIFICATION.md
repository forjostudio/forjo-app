---
phase: quick-261124-q68
verified: 2026-11-24T23:50:00Z
status: human_needed
score: 6/7 must-haves verified
covered_files:
  - app/(dashboard)/clients/clients-client.tsx
  - app/(dashboard)/finances/finances-client.tsx
  - lib/panel-history.ts
  - test/panel-history-clients.test.ts
  - test/panel-tabs.test.ts
covered_digest: "v1:sha256:81dc8ed394aa7ed7d14a4d2a855559ad11e937a6c63f6d37f93fb1679dbcf77f"
behavior_unverified: 0
overrides_applied: 0
re_verification: false
human_verification:
  - test: "Re-correr la sonda completa de la app (47 recorridos), los tres G1-* de scroll y el D-finanzas-ancho con un mes con datos, cuando el negocio de prueba local vuelva a tener turnos, ventas, egresos y campos en /web"
    expected: "app 47 medidos con la unica FALLA declarada (R-G3-10-primer-toque-atras-pronto); scroll 9/9 en tras-el-fix; sin desborde en Finanzas con contadores de 3 digitos en los tabs"
    why_human: "El must-have de regresion pedia esas corridas completas. No se pudieron completar por el estado de la base local (negocio sin datos), no por el codigo. Solo corrieron R-T 12/12, R-B1 4/4, estatica 18/18 y scroll 6/9"
  - test: "Abrir /finances en un celular real (Chrome Android) y Safari iOS a 360-390 px; tocar dos veces rapido una fila de Clientes"
    expected: "Sin scroll horizontal en Ventas/Egresos; el segundo toque no apila ?c=A sobre ?c=A y un atras vuelve al listado"
    why_human: "Chrome de escritorio con viewport emulado no es el telefono real. Residuo declarado en el SUMMARY"
---

# Quick 261124-q68: los cuatro pendientes de v0.31 - Verification Report

**Goal:** Cerrar R3-WR-01, R2-IN-04, /clients fallback sin nodo y Finanzas desborde a 390, midiendo primero (rojo commiteado antes del arreglo) y arreglando solo lo que reproduce.
**Verified:** 2026-11-24
**Status:** human_needed
**Re-verification:** No, verificacion inicial

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | R3-WR-01 medido rojo (R1..R4 dan `none`) y arreglado (`push`); W1-tab y R5 siguen `none` | VERIFIED | Con `lib/panel-history.ts` de `8e7bae0` (pre-fix) y los tests de HEAD: 11 rojos, entre ellos R1, R2, R3, R4 y `C-llegada-ejecutor`. Con el lib de HEAD: 628/628 verdes. `applyPanelView` (lib/panel-history.ts, primera sentencia) lleva `if (consumoEnVuelo) { if (state === estadoDelConsumo \|\| url === urlDelConsumo) return 'none'; soltarConsumo() }`. Archivo restaurado y limpio (`git diff --quiet HEAD`). |
| 2 | Chequeo de llegada igual al del menu, bloque de encendido y lista cerrada de retrocesos sin cambios; mutaciones M-a/M-b revertidas | VERIFIED | `C-llegada-ejecutor`, `C-retroceso-unico*` y `C-back-cerrado` verdes en HEAD. El diff de `lib/panel-history.ts` solo toca docblocks, `toqueDeFicha` y la primera sentencia del ejecutor. Arbol sin restos de mutacion. |
| 3 | R2-IN-04: la fila decide con la URL de ahora por `toqueDeFicha` + `clienteDeLaUrl` unica; `(j)` rojo antes y verde despues | VERIFIED | `toqueDeFicha` pura exportada; `clients-client.tsx` define `clienteDeLaUrl` una vez, la usa en el render y en el `onClick` con `window.location.search`. Con el lib pre-fix: `IN04-doble`, `IN04-a-b`, `IN04-fusion`, `IN04-ajeno` y el unitario de `toqueDeFicha` rojos; con HEAD, verdes. `(j)` se apoya en la fuente de la pantalla de HEAD, por eso no cae con el lib viejo; el rojo de `(j)` queda por el commit `8e7bae0` (+20 lineas de test) y la mutacion M-c del SUMMARY. |
| 4 | `/clients` medido con dos recorridos nuevos con esperados commiteados antes; si la condicion no se arma, `page.tsx` sin commits | VERIFIED | `260a3b9` (esperados) es ancestro de `a6e0a5a`. Log `cl-hipotesis.txt`: `condicion=inalcanzable` en movil (alto_doc 844 = viewport 844, contenedor `absolute inset-0`) y escritorio (scroll maximo 83 = desplazamiento del borde, `primera_top=0`), sin escrituras de scroll al abrir. `git diff be80ed4..HEAD -- app/(dashboard)/clients/page.tsx` vacio. La geometria no depende de la cantidad de clientes (contenedor absoluto / `lg:h-screen`), asi que la lista de 1 fila no invalida el veredicto. |
| 5 | Finanzas: desborde medido por CDP a 360/375/390/430/1280 con culpable nombrado; arreglo solo de clases; sin desborde tras el fix; huella de escritorio igual | VERIFIED | Antes (`fin-hipotesis.txt`): 407 px (Ventas) y 415 px (Egresos) a 360/375/390, culpable el boton `Nueva venta`/`Nuevo egreso` (`shrink-0`, `nowrap`); 430 entra. Fix `c89b4f5`: unica linea `flex items-center` -> `flex flex-wrap items-center` (+ comentario). Despues (`fin-tras-el-fix.txt`): `scrollWidth == clientWidth` en todos los anchos moviles; huellas de escritorio `bbb534f2...`, `70758746...`, `12a5352d...` identicas antes y despues. `2631401` (esperados) ancestro de `c89b4f5`. |
| 6 | Sin regresion: tsc, npm test, eslint, build, sondas completas (app 47, R-T, R-B1, estatica, scroll 8/8) | UNCERTAIN | Verificado ahora: `tsc --noEmit` rc 0; las 6 suites de historial 628/628. Segun logs del quick: npm test 125 archivos 2500 verdes, build rc 0, eslint 1 antes = 1 despues, estatica 18/18, R-T 12/12, R-B1 4/4. NO cumplido literalmente: la sonda completa de la app no completo ("no se pudo ensuciar /web: campo=null", base local sin datos) y scroll dio 6/9 (los tres G1-* con ERROR-DEL-INSTRUMENTO por falta de un mes con >= 10 turnos). Es entorno, no codigo, pero el must-have pedia esas corridas. El SUMMARY lo declara con honestidad. |
| 7 | Registro dice lo medido; las cuatro entradas de `deferred-items.md` cerradas sin borrar lineas | VERIFIED | `## (o)` en `.planning/debug/tabs-en-la-url-medida.md:2438`, con `veredictos (o):` y `cierre (o):` (lineas 2597-2598). `deferred-items.md`: diff solo con adiciones (+23, 0 borradas), 4 bloques **Cierre:**/**Veredicto:** (Finanzas, /clients, R2-IN-04, R3-WR-01). |

**Score:** 6/7 truths verified (1 UNCERTAIN, ver Human Verification)

### Orden rojo-antes-del-arreglo (`git merge-base --is-ancestor`)

| Rojo / esperados | Arreglo | Resultado |
|---|---|---|
| `8e7bae0` | `e53dd41` (R3-WR-01) | ancestro OK |
| `8e7bae0` | `a810e07` (R2-IN-04) | ancestro OK |
| `260a3b9` | `a6e0a5a` (registro /clients; sin fix) | ancestro OK |
| `2631401` | `c89b4f5` (Finanzas) | ancestro OK |

Nota: `8e7bae0` es solo de tests (2 archivos); el rojo se reprodujo localmente (11 fallas contra el lib pre-fix).

### Archivos intocables

`git diff be80ed4..HEAD` sobre `lib/overlay-history.ts`, `lib/dirty-history.ts`, `scripts/con-turno.mjs`, `next.config.ts` y `app/(dashboard)/clients/page.tsx`: vacio (sin cambios). No hay cambios en `app/api` ni `supabase`. El `git status` muestra ` M app/(onboarding)/onboarding/page.tsx`, que no es de este quick (sesion concurrente); no hay commits de q68 sobre ese archivo.

### Anti-Patterns

Sin `TBD/FIXME/XXX` agregados en los archivos de produccion tocados (diff leido completo: solo comentarios explicativos). No hay stubs: `toqueDeFicha` es una funcion real con uso en la pantalla y el espejo del simulador.

### Anotaciones sobre la evidencia con la base vacia

- Los veredictos de `/clients` y R3/R2 no dependen de datos (geometria y simulador). La evidencia restante los sostiene.
- El veredicto de Finanzas se midio con 0 turnos: el culpable (boton `shrink-0`) es independiente de los contadores, pero "meses con datos" (un `Turnos (123)` que ensancha la TabsList) quedo sin medir; `flex-wrap` lo cubre por construccion pero no hay numero. Declarado como residuo.
- Los tres recorridos "ERROR-DEL-INSTRUMENTO" (G1-*) y el aborto de la sonda de app son consistentes con una base sin datos; no contradicen ningun veredicto.

### Human Verification Required

1. **Re-correr las sondas que el entorno impidio** (app 47 recorridos, G1-* de scroll, D-finanzas-ancho con mes con datos) cuando el negocio de prueba local tenga datos. Esperado: sin fallas nuevas, `paneles con alto minimo: 3`.
2. **Telefono real / Safari iOS**: Finanzas a 360-390 sin scroll horizontal y doble toque en una fila de Clientes. Esperado: una sola entrada `?c=` y atras al listado.

### Gaps Summary

Sin gaps de codigo: los cuatro veredictos tienen rojo commiteado antes del arreglo, los arreglos son minimos y estan cubiertos por tests que ahora verifique en verde (628/628) y que dan rojo contra el codigo anterior. Lo unico que queda es la regresion completa por navegador que el plan pedia y que no pudo cerrarse por el estado de la base local; por eso `human_needed` y no `passed`.

---

_Verified: 2026-11-24_
_Verifier: Claude (gsd-verifier)_
