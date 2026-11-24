---
phase: quick-261124-iu8
verified: 2026-11-24T14:35:00-03:00
status: human_needed
score: 6/7 must-haves verified
covered_files:
  - .planning/debug/probes/onb-crear-negocio-colgado.mjs
  - .planning/workstreams/onboarding/quick/261124-iu8-onboarding-crear-mi-negocio-no-queda-tra/261124-iu8-PLAN.md
  - .planning/workstreams/onboarding/quick/261124-iu8-onboarding-crear-mi-negocio-no-queda-tra/261124-iu8-SUMMARY.md
  - "app/(onboarding)/onboarding/page.tsx"
  - lib/con-limite.test.ts
  - lib/con-limite.ts
  - lib/onboarding-alta.test.ts
  - lib/onboarding-alta.ts
  - test/onboarding-finish-loading.test.ts
covered_digest: "v1:sha256:c5842ebcaf6e15823e64fbfa1d73438fcdf56bd790cee8b8384e17912bb70c0e"
behavior_unverified: 1
overrides_applied: 0
behavior_unverified_items:
  - truth: "Con un refresh de auth que no vuelve nunca, «Crear mi negocio» deja «Guardando...» en <= 25 s, muestra aviso + «Reintentar», y el reintento termina con 1 solo negocio y 1 solo POST a businesses (truths 1, 2 y 5 del PLAN, medidos en navegador)"
    test: "Correr la sonda en navegador real: node scripts/con-turno.mjs node .planning/debug/probes/onb-crear-negocio-colgado.mjs refresh-colgado (y config-colgada, mail, password, oauth-ish, refresh-ok, mail mobile)"
    expected: "refresh-colgado = error-y-reintento-ok (COINCIDE); config-colgada = exito; las demás = exito; usuario de prueba borrado al final"
    why_human: "El verificador tenia prohibido abrir navegador o dev server. La logica (limite, corte del intento vencido, retomar sin duplicar, fail-closed) esta probada por tests puros que corri; el encadenado con el DOM y con el lock real de auth-js sólo lo mide la sonda, y su resultado hoy es una afirmacion del SUMMARY."
human_verification:
  - test: "En el teléfono (cuenta nueva): completar el wizard, tocar «Crear mi negocio» con buena señal"
    expected: "Toast «¡Negocio creado con éxito!» y llega al paso 5 (Integraciones)"
    why_human: "Camino feliz en un dispositivo real con red real"
  - test: "En el teléfono (otra cuenta nueva): tocar «Crear mi negocio» y poner modo avión enseguida"
    expected: "En ~20 s aparece el aviso rojo sobre los botones (mismo texto en toast), el botón dice «Reintentar» y queda habilitado, «Atrás» y los campos nombre/slug quedan deshabilitados"
    why_human: "Corte de red real en WebKit/Chrome móvil; es justamente el entorno donde se sospecha que se trabó en prod y la sonda sólo lo simula con CDP"
  - test: "Sacar el modo avión y tocar «Reintentar»"
    expected: "Lleva al paso 5; no sale error de slug repetido"
    why_human: "Reintento tras una caída de red real (el insert pudo o no haber llegado)"
  - test: "Entrar al panel de esa cuenta"
    expected: "Un solo negocio, con servicios, profesionales y horarios cargados una sola vez (sin duplicados)"
    why_human: "Idempotencia contra la base real (prod/staging), no sólo la local"
  - test: "(Pendiente heredado del debug) Correr las mediciones de prod de .planning/debug/onboarding-guardando-colgado.md (queries 1-3, logs 4-5, preguntar al dueño)"
    expected: "Confirmar qué await se trabó el 2026-11-19"
    why_human: "Requiere acceso a prod; el disparador real sigue sin confirmar. El arreglo pone tope al síntoma, no elimina la causa (opción B diferida)"
---

# Quick 261124-iu8: «Crear mi negocio» no queda en «Guardando…» — Informe de verificación

**Objetivo:** «Crear mi negocio» del onboarding no puede quedar trabado en «Guardando…»: límite de ~20 s, aviso de error con «Reintentar» y botón liberado; reintentar nunca crea un segundo negocio del mismo dueño; sin dependencias nuevas ni migraciones.
**Verificado:** 2026-11-24
**Estado:** human_needed (el código cumple todo lo comprobable sin navegador; falta la prueba en el teléfono y la re-corrida de la sonda)
**Re-verificación:** No, verificación inicial

## Qué se corrió yo mismo

| Comprobación | Resultado |
|---|---|
| `vitest run --project pure` sobre `lib/con-limite.test.ts`, `lib/onboarding-alta.test.ts`, `test/onboarding-finish-loading.test.ts` | 3 archivos, 41 tests pasan, 0 fallos |
| `./node_modules/.bin/tsc --noEmit` | exit 0 |
| eslint de los 6 archivos de código | sólo la deuda previa de `page.tsx` (1 error `set-state-in-effect` en `setSlug`, línea 236, + 1 warning); archivos nuevos limpios |
| `git diff 9caaea6..HEAD -- package.json package-lock.json supabase/` | vacío (sin dependencias ni migraciones) |
| `@supabase/supabase-js` instalado | 2.106.2 |
| Marcadores TBD/FIXME/XXX en lo tocado | ninguno |
| Suite `pure` completa | NO re-corrida (el SUMMARY dice 86 archivos / 2074 pasan; no lo verifiqué) |
| Sonda en navegador / `next build` | NO corridos (restricción del pedido) |

## Verdades observables

| # | Verdad (PLAN) | Estado | Evidencia |
|---|---|---|---|
| 1 | Con refresh colgado, «Guardando…» sale en <= 25 s con aviso (toast + `role="alert"`) y el mismo botón queda habilitado como «Reintentar» | PRESENT_BEHAVIOR_UNVERIFIED | Código presente y cableado: `LIMITE_ALTA_MS = 20_000` (page.tsx:48), `altaDelNegocio` bajo `conLimite` (onboarding-alta.ts), catch con `esAltaSinConfirmar` → `setErrorAlta` + `toast.error` + `setLoading(false)` (page.tsx:684-697), `<p role="alert">` (1311) y botón `{loading ? 'Guardando...' : errorAlta ? 'Reintentar' : ...}` con `disabled={loading}` (1351-1352). Tests puros: vence a `ms` con `LimiteVencido`, signal abortado. El tiempo extremo a extremo (+20.4 s) es medida de la sonda según el SUMMARY, no re-corrida |
| 2 | El intento vencido no inserta tarde; el reintento completa con 1 negocio y 1 POST | PRESENT_BEHAVIOR_UNVERIFIED | `cortar()` por `signal.aborted` tras cada await y `.abortSignal(signal)` en cada query (page.tsx:506, 526). Tests puros: «obtenerUsuarioId colgado: ... si después resuelve, ni busca ni inserta», «búsqueda colgada ... NO inserta». El conteo de 1 POST / 1 negocio en navegador es de la sonda (no re-corrida) |
| 3 | Antes de insertar se buscan los negocios del dueño por `owner_id` de la sesión: otro slug → `ya-existia`; mismo slug → `retomado` aplicando sólo lo que falta; error o vencimiento → no escribe nada | ✓ VERIFIED | `altaDelNegocio`: owner_id viene de `getUser()` (page.tsx:504, nunca del form), búsqueda `select('id, slug').eq('owner_id', ownerId)`. Tests puros cubren: otro slug sin insertar, mismo slug retomado sin insertar, error de búsqueda fail-closed, leer configuración que tira, `pasosDeConfiguracion` (retomado con servicios/profesionales/franjas no aplica nada; sólo servicios → el mapeo apunta a ids existentes). page.tsx:581-646 condiciona los tres inserts con `pasos.*` |
| 4 | Mientras haya intento sin confirmar, «Atrás» y nombre/slug deshabilitados; el reintento usa el mismo slug; sólo una respuesta del server libera | ✓ VERIFIED | `altaSinConfirmar = loading \|\| errorAlta !== null` (page.tsx:142) en `disabled` de «Atrás» (1318) y de los inputs nombre (893) y slug (958). `AltaSinConfirmar` cuando insert/búsqueda fallan sin status HTTP (tests: status 0/sin status vs 23505 con status). El gate de fuente de DC-7 corrió verde (4 tests). El 23505 sigue siendo la red de la base |
| 5 | Ningún `await` de `handleFinish` espera sin tope; paso de configuración trabado se corta a 10 s, avisa, el resto se guarda y sigue a integraciones | ✓ VERIFIED (código) / medición de navegador en human_verification | Lectura de page.tsx:501-679: todo `await` es `altaDelNegocio(` o `enPlazo(` (logo upload+update, services, professionals, `save_agenda_blocks`, `linkLeadOnSignup`) con `crearPlazo(20_000, 10_000)`; los inserts/RPC llevan `.catch(aRespuestaFallida)` y caen en su toast de siempre. Gate de fuente «cada await va seguido de altaDelNegocio( o enPlazo(» pasa; `crearPlazo` testeado (tope por paso dentro de total compartido). `config-colgada` en navegador: 2ª corrida exito a +12.6 s según SUMMARY (1ª fue `tarde` por compilación de dev; el margen en el peor caso es ~4 s sobre 25 s) |
| 6 | Variantes mail/password/mail mobile/oauth-ish/refresh-ok siguen en `COINCIDE`; la sonda borra su usuario | PRESENT_BEHAVIOR_UNVERIFIED | La sonda tiene los esperados (`ESPERADO`), el conteo de POST/negocios y `delete from auth.users where email = ...` (línea 594). Los resultados `COINCIDE` son afirmación del SUMMARY; no re-corrí la sonda |
| 7 | Sin deps nuevas, sin migraciones, sin endpoint/server action nuevos, supabase-js 2.106.2, opción B diferida en el SUMMARY; verde local (tsc, eslint exacto, tests) | ✓ VERIFIED | Diff vacío de package*.json y supabase/; 2.106.2 instalado; no hay ruta ni action nueva (archivos tocados listados arriba); «Diferidos» del SUMMARY anota la opción B; tsc 0; eslint = deuda previa exacta (1 error + 1 warning) |

**Puntaje:** 6/7 contando las verdades 3, 4, 5, 7 y las dos con evidencia puntual como verificadas por código; 1, 2 y 6 son la misma familia (medición en navegador) y quedan como un solo ítem `behavior_unverified`. Ver `behavior_unverified: 1`.

## Artefactos

| Artefacto | Estado | Detalle |
|---|---|---|
| `lib/con-limite.ts` | ✓ VERIFICADO | `LimiteVencido`, `conLimite`, `crearPlazo`, `aRespuestaFallida`; limpia el timer, aborta el signal, maneja rechazo tardío |
| `lib/con-limite.test.ts` | ✓ VERIFICADO | 14 tests con timers falsos |
| `lib/onboarding-alta.ts` | ✓ VERIFICADO | `altaDelNegocio`, `AltaSinConfirmar`, `esAltaSinConfirmar`, `pasosDeConfiguracion`; importado y usado en page.tsx |
| `lib/onboarding-alta.test.ts` | ✓ VERIFICADO | 16 tests con fakes |
| `app/(onboarding)/onboarding/page.tsx` | ✓ VERIFICADO | `handleFinish` cableado a todo lo anterior; `leerConfiguracionDelNegocio` filtra por `business_id` y es fail-closed |
| `test/onboarding-finish-loading.test.ts` | ✓ VERIFICADO | 11 tests (5 de WR-02 intactos + gate de awaits + gate de DC-7) |
| `.planning/debug/probes/onb-crear-negocio-colgado.mjs` | ✓ VERIFICADO (existe y es sustantiva) | Esperados nuevos, variante `config-colgada`, liberación en tandas, borrado del usuario. Los veredictos de la sonda no se re-corrieron |

## Enlaces clave

| De | A | Vía | Estado |
|---|---|---|---|
| `handleFinish` | `altaDelNegocio` | `await altaDelNegocio({ limiteMs, slug, obtenerUsuarioId, buscarNegociosDelDueno, leerConfiguracion, insertarNegocio })` con el mismo cliente `supabase` | CABLEADO |
| `altaDelNegocio` | `conLimite` | un solo límite; `cortar()` tras cada await | CABLEADO |
| configuración | `crearPlazo` | `enPlazo(...)` + `.catch(aRespuestaFallida)` | CABLEADO |
| catch | `errorAlta` → alert + «Reintentar» | `esAltaSinConfirmar(err)` | CABLEADO |
| `altaSinConfirmar` | `disabled` de «Atrás», nombre, slug | líneas 893, 958, 1318 | CABLEADO |
| `retomado.yaTiene` | pasos de servicios/profesionales/horarios | `pasosDeConfiguracion` → `pasos.*` | CABLEADO |

## Anti-patrones y observaciones

| Sev. | Hallazgo |
|---|---|
| Info | Sin TBD/FIXME/XXX en lo tocado; sin stubs |
| Warning (residual, ya anotado en parte por el SUMMARY) | Si un insert aborto-pero-llegado todavía no aterrizó cuando el dueño toca «Reintentar», la búsqueda vuelve vacía y el segundo insert cae en 23505. Esa rama es «error con respuesta» y libera el bloqueo de slug (errorAlta queda en null), así que en ese hueco angosto el dueño podría cambiar el slug y crear un segundo negocio. El SUMMARY lo cubre sólo parcialmente (Residuo 3, caso `getUser` por red). Ventana mínima: el reintento ocurre >= 20 s después del corte y el insert ya habría aterrizado; no lo marco como falla |
| Info | `upload` del logo no acepta signal: tiene tope pero no cancelación (es upsert al mismo path, no duplica) |
| Info | Peor caso de `handleFinish` con toda la configuración trabada ~21 s: ~4 s de margen sobre el tope de 25 s de la sonda (anotado en el SUMMARY) |
| Info | El disparador real de prod (2026-11-19) sigue sin confirmar; el arreglo pone tope al síntoma. La opción B (auth-js >= 2.110) queda diferida (D-03) |

## Ajuste a lo que dice el SUMMARY

- Los commits propios son los 7 pedidos; en `git log` se ven los 3 ajenos (`7629e72`, `e01be07`, `95865cf`) y no los evalué. `git diff --name-only 9caaea6..HEAD` incluye archivos de esos commits ajenos (finanzas-xlsx, etc.), pero `page.tsx` sólo fue tocado por `4cc7ccc` y `55547fc`.
- El dato «86 archivos / 2074 pasan» y todos los `COINCIDE` de la sonda no los reproduje.

## Resumen de gaps

No hay gaps bloqueantes: lo que el objetivo pide está en el código, cableado y cubierto por tests puros y por gates de fuente que pasan. Queda `human_needed` porque (a) el encadenado en navegador (aviso en <= 25 s, 1 solo negocio y 1 solo POST) sólo está respaldado por la sonda reportada en el SUMMARY, que no re-corrí, y (b) el comportamiento con red móvil real sólo se comprueba en el teléfono.

---

_Verificado: 2026-11-24_
_Verificador: Claude (gsd-verifier)_
