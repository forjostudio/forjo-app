---
phase: quick-261124-iu8
plan: "01"
status: complete
subsystem: onboarding
tags: [onboarding, supabase-auth, timeout, idempotencia, multi-tenant]
requires:
  - debug onboarding-guardando-colgado (mecanismo reproducido 1/1)
provides:
  - lib/con-limite.ts (conLimite, crearPlazo, aRespuestaFallida, LimiteVencido)
  - lib/onboarding-alta.ts (altaDelNegocio, AltaSinConfirmar, esAltaSinConfirmar, pasosDeConfiguracion)
  - handleFinish con tope en todos sus awaits, reintento idempotente y bloqueo del slug
affects:
  - app/(onboarding)/onboarding/page.tsx
  - test/onboarding-finish-loading.test.ts
  - .planning/debug/probes/onb-crear-negocio-colgado.mjs
tech-stack:
  added: []
  patterns:
    - "límite de tiempo con AbortSignal + corte manual por signal.aborted después de cada await (Promise.race no cancela)"
    - "plazo compartido con tope por paso para efectos best-effort"
    - "búsqueda por owner_id de la sesión antes de insertar (idempotencia sin unique en la base)"
key-files:
  created:
    - lib/con-limite.ts
    - lib/con-limite.test.ts
    - lib/onboarding-alta.ts
    - lib/onboarding-alta.test.ts
  modified:
    - app/(onboarding)/onboarding/page.tsx
    - test/onboarding-finish-loading.test.ts
    - .planning/debug/probes/onb-crear-negocio-colgado.mjs
decisions:
  - "La fase de alta (getUser + búsqueda + insert) corre bajo un único límite de 20 s con el mismo cliente del navegador, sin endpoint (DC-1)"
  - "La configuración post-alta usa un plazo compartido de 20 s con tope de 10 s por paso; un vencimiento cae en el toast de siempre (DC-2)"
  - "Una búsqueda de negocios que falla SIN respuesta HTTP también es AltaSinConfirmar (mantiene el bloqueo del slug, DC-7)"
  - "Opción B (supabase-js / auth-js >= 2.110) diferida (D-03)"
metrics:
  duration: "~26 min (14:01 → 14:27 AR)"
  completed: 2026-11-24
actuals:
  tokens: 14200
  tasks: 3
  commits: 10
plan_head_before: 9caaea61c7666fbb5dc88374de8fc23beccdeab6
commits: 10
---

# Phase quick-261124-iu8 Plan 01: «Crear mi negocio» no queda en «Guardando...» Summary

Todo `await` de `handleFinish` tiene tope ahora. La fase de alta (usuario, negocios del dueño, insert) corre bajo un límite de 20 s y la configuración bajo un plazo de 20 s con tope de 10 s por paso. El reintento no arma nunca un segundo negocio: busca los negocios del dueño antes de insertar, retoma el propio sin duplicar la configuración y deja el slug bloqueado mientras el alta no se confirme. Está medido con la sonda: rojo antes del arreglo, verde después.

## En criollo

Antes, si el teléfono perdía la conexión justo cuando la app renovaba la sesión, el botón quedaba en «Guardando...» para siempre. Ahora, a los ~20 s sale un aviso ("No pudimos confirmar que se creó tu negocio... tocá Reintentar") y el mismo botón pasa a decir «Reintentar». Si el negocio sí se llegó a crear, el reintento lo encuentra y sigue; si no, lo crea. En los dos casos queda un solo negocio. Mientras tanto el dueño no puede volver atrás a cambiar la URL: así el reintento siempre usa el mismo slug.

## Commits

BASE (HEAD antes de la primera tarea) = `9caaea6`. En el medio hay 3 commits de otra sesión que trabajaba en `main` al mismo tiempo (`7629e72`, `e01be07`, `95865cf`): por eso `rev-list` cuenta 10 y los propios son 7.

| # | Hash | Tarea | Asunto |
|---|------|-------|--------|
| 1 | `5ec62c2` | T1 | test: sonda del alta colgada con el esperado nuevo, aviso y reintento sin doble negocio (rojo) |
| 2 | `784d2de` | T1 | test: la sonda libera el refresh retenido en tandas (preflight y después el POST) |
| 3 | `cfae9b3` | T2 | test: límite de tiempo y alta idempotente del onboarding (rojo) |
| 4 | `94685fd` | T2 | feat: helper de límite de tiempo y alta idempotente del negocio |
| 5 | `4cc7ccc` | T2 | fix: crear mi negocio no queda en Guardando; aviso, Reintentar y sin doble negocio |
| 6 | `f7ee7dd` | T3 | test: ningún await de handleFinish queda sin límite (rojo) y gate del bloqueo del slug |
| 7 | `55547fc` | T3 | fix: la configuración del alta tiene plazo; un paso trabado no deja el botón en Guardando |

Orden verificado: la sonda (1-2) va antes que cualquier cambio de `app/` o `lib/`, y cada test rojo va antes de su verde.

## Sonda: rojo (código anterior) y verde (código nuevo)

Todas por `node scripts/con-turno.mjs`, una por vez, con 3031 y 9336 libres al salir y el usuario de prueba borrado.

| Variante | Rojo (T1, código `9caaea6`) | Verde (T2-T3) |
|---|---|---|
| `refresh-colgado` | `colgado`, NO COINCIDE (exit 2): «Guardando… [disabled]» 40 s, sólo `POST /auth/v1/token` pendiente, 0 POST a businesses, sin negocio | `error-y-reintento-ok`, COINCIDE. Tracer (T2): aviso a +20.8 s, «Atrás» deshabilitado 42/42, 0 POST antes de liberar, reintento → `/onboarding/integraciones` a +23.9 s, 1 POST, 1 negocio. Final (T3): aviso a +20.4 s, 40/40, reintento → integraciones a +23.5 s, 1 POST, 1 negocio, services=1 professionals=1 time_blocks=6 |
| `config-colgada` | `colgado`, NO COINCIDE (exit 2): negocio creado, `POST /rest/v1/services` retenido, services=0 professionals=0 time_blocks=0, sin toast | 1ª corrida: `tarde`, NO COINCIDE (navegó a +32.5 s; ver Desvíos). 2ª: `exito`, COINCIDE: corte de servicios a +10.4 s (`limite_vencido`), toast «Creamos tu negocio, pero no pudimos guardar tus servicios…», navegación a +12.6 s; services=0 professionals=1 time_blocks=6 |
| `mail` | `exito`, COINCIDE (control del instrumento) | `exito`, COINCIDE, +1.8 s |
| `password` | (no se corrió en rojo) | `exito`, COINCIDE, +1.3 s |
| `oauth-ish` | (no se corrió en rojo) | `exito`, COINCIDE, +2.8 s |
| `refresh-ok` | (no se corrió en rojo) | `exito`, COINCIDE, +2.3 s (refresh 200 en 107 ms) |
| `mail mobile` | (no se corrió en rojo) | `exito`, COINCIDE, +2.3 s (390×844) |

Todas las variantes con éxito terminan con exactamente 1 POST a businesses y la configuración completa (services=1, professionals=1, time_blocks=6).

## Gates

| Gate | Resultado |
|---|---|
| `vitest run --project pure` (completo) | 86 archivos, 2074 pasan + 3 expected fail, 0 fallos (piso 82 / 1976). Corrida a las 14:26 AR, fuera de la zona de los canarios |
| Tests nuevos | `lib/con-limite.test.ts` + `lib/onboarding-alta.test.ts`: 30. `test/onboarding-finish-loading.test.ts`: 11 (5 de WR-02 sin cambios + 6 nuevos) |
| Gate de awaits | rojo con el código de T2 (`await sin límite: await bucket.upload(...)`), verde con T3 |
| Gate de DC-7 | nació verde; con la mutación (sacar `altaSinConfirmar` del `disabled` de «Atrás») se puso en rojo; revertida con Edit, `git diff` vacío |
| `./node_modules/.bin/tsc --noEmit` | 0 |
| eslint de los 6 archivos de código | sólo la deuda previa de page.tsx: 1 error `set-state-in-effect` (`setSlug`) + 1 warning (`Badge`). Archivos nuevos: 0 |
| `npm run build` | 0 (después de las sondas) |
| `git diff --stat 9caaea6..HEAD -- package.json package-lock.json supabase/` | vacío |
| Usuarios `onb-colgado-%` en el Supabase local | 0 |
| Push | no |

## Dónde quedó cada decisión

- **D-01** (límite de ~20 s al alta, aviso y «Reintentar»): `LIMITE_ALTA_MS = 20_000` + `altaDelNegocio`. El catch con `esAltaSinConfirmar` pone `errorAlta`, el toast, la línea `role="alert"` y la etiqueta «Reintentar».
- **D-02** (no crear otro si ya existe; encontrar el que llegó sin respuesta): la búsqueda por `owner_id` con la sesión corre antes de cada insert. Otro slug da `ya-existia` (aviso y paso 5); el mismo slug da `retomado`.
- **D-03** (sin dependencias y sin tocar supabase-js): cumplido, supabase-js sigue en 2.106.2. La opción B queda en Diferidos.
- **D-04** (rojo primero, controles en verde, test puro del helper): cumplido (ver las tablas).
- **DC-1** (mismo cliente, sin endpoint): los adaptadores de `altaDelNegocio` usan el `supabase` del componente. No hay ruta de API ni server action nueva.
- **DC-2** (plazo de la configuración): `crearPlazo(LIMITE_CONFIG_MS, LIMITE_PASO_MS)`. Logo, servicios, profesionales, `save_agenda_blocks` y `linkLeadOnSignup` corren con `enPlazo`; los inserts y el RPC llevan `.abortSignal(signal)` y `.catch(aRespuestaFallida)`.
- **DC-3** (retomar sin duplicar): `leerConfiguracionDelNegocio` (fuera de `handleFinish`, fail-closed) + `pasosDeConfiguracion`. Las condiciones son de una línea sobre servicios, profesionales y RPC, y `liveServiceIds = pasos.idsVigentes`.
- **DC-4** (intento vencido inerte): se corta por `signal.aborted` después de cada await. La sonda lo confirma: el `getUser` tardío del primer intento (+21.1 s) no generó búsqueda ni insert.
- **DC-5** (aviso): toast + `<p role="alert">` siempre montado en el último paso + el mismo botón con «Reintentar».
- **DC-6** (sonda): variante `config-colgada`, `refresh-colgado` con liberar y reintentar, y borrado del usuario.
- **DC-7** (bloqueo): `altaSinConfirmar = loading || errorAlta !== null` deshabilita «Atrás» y los inputs de nombre y slug. Está cubierto por el gate de fuente y por la sonda (`atras-habilitado`).

## Desvíos del plan

### Arreglados sobre la marcha

**1. [Regla 3 - Bloqueo del instrumento] La sonda liberaba sólo el preflight**
- **Encontrado en:** la Tarea 1, con la primera corrida en rojo.
- **Problema:** lo primero que CDP retiene con `*auth/v1/token*` es el OPTIONS. Al liberarlo, el POST del refresh entra pausado a su vez, y un solo `continueRequest` por cada id retenido lo dejaba trabado.
- **Arreglo:** se libera en tandas hasta 1 s sin requests nuevos y recién ahí se hace `Fetch.disable`. No cambia ningún esperado. Va en un commit propio (`784d2de`), antes de tocar producto.

**2. [Regla 2 - DC-7] Búsqueda sin respuesta HTTP = `AltaSinConfirmar`**
- **Encontrado en:** la Tarea 2, al escribir el contrato.
- **Problema:** con el contrato del plan, una búsqueda que fallaba por red (status 0) se tiraba como un error común y liberaba el bloqueo del slug. Eso contradice DC-7 ("sólo una respuesta del server libera el bloqueo").
- **Arreglo:** `buscarNegociosDelDueno` también devuelve `status?`. Sin status o con status 0 se tira `AltaSinConfirmar` (no inserta, mantiene el bloqueo). Con status HTTP se tira su error, como pedía el plan. Hay un test aparte para cada caso.
- **Archivos:** `lib/onboarding-alta.ts` y su test.

**3. [Regla 1 - Diseño] La línea `role="alert"` va en un contenedor junto con la fila de navegación**
- **Problema:** la `Card` es `flex flex-col gap-4`. Como hijo directo, el `<p>` vacío sumaba un hueco de 16 px en el último paso aunque no hubiera error.
- **Arreglo:** un `<div>` envuelve el `<p>` y la fila de navegación. Un flex item tiene su propio contexto de formato, así que el `mt-6` de la fila queda igual y el `<p>` vacío mide 0. Visualmente no cambia nada cuando no hay error.

**4. `upload` del logo sin signal**
- `storage-js` no acepta `AbortSignal` en `upload` (sólo en download y list). Queda con tope pero sin cancelación. Es un `upsert` al mismo path, así que si termina tarde no duplica nada.

### Corridas que no fueron veredicto

- **`refresh-colgado`, 1ª corrida de la T1:** salió con exit 1 porque Chrome no publicó el target en 10 s (el servidor había tardado 108 s en levantar: la máquina estaba cargada). Fue entorno; se relanzó igual y dio el rojo.
- **`config-colgada`, 1ª corrida verde:** dio `tarde` (navegó a +32.5 s). El producto hizo lo esperado: corte de servicios a +10.8 s y `router.replace` a +20.8 s. Lo que se pasó fue el `next dev` de la sonda: la primera llamada a la server action disparó una compilación de 20.3 s (`Fast Refresh rebuilding`, `linkLeadOnSignup in 20503ms`), cuando lo normal es de 0.1 a 1.8 s, y el log mostró una compactación de la caché de Turbopack de 11.9 s en la corrida siguiente. El plazo hizo su trabajo: cortó la server action a los 9.9 s que le quedaban, así que `handleFinish` igual terminó dentro de su tope de ~21 s. Se relanzó sin tocar nada y dio `exito` a +12.6 s. **El esperado (25 s) no se tocó.** Queda una nota: en el peor caso, con toda la configuración trabada, `handleFinish` usa unos 21 s, y para la navegación al paso 5 quedan sólo ~4 s del margen de 25 que fija la sonda.

### Otra sesión en `main` en paralelo

- Mientras esto corría, otra sesión commiteó en `main` (`7629e72`, `e01be07`, `95865cf`, del quick 261124-ine y el UAT de q8v). Cada commit propio se hizo con `git commit -- <rutas>` y se revisó con `git show --stat`: ninguno arrastró archivos ajenos.

## Diferidos

- **Opción B, el arreglo de fondo (D-03):** actualizar `@supabase/supabase-js` / auth-js a >= 2.110, que coordina sin lock (PR #2392; el bug #936 es el cuelgue con `navigator.locks` en iOS Safari / WebKit). Elimina la causa (la cola del lock sin timeout). Esta tarea sólo pone tope al síntoma.
- **Residuo 1:** si el lock queda trabado indefinidamente, cada «Reintentar» vence de nuevo hasta recargar la página, y recargar pierde lo cargado en el wizard.
- **Residuo 2:** el bloqueo de DC-7 vive en el estado de la página. Salir y volver a `/onboarding` lo pierde; ahí la única red es la búsqueda por dueño del intento siguiente.
- **Residuo 3:** `getUser()` que falla por red devuelve `user: null` → «No autenticado» → error común, que libera el bloqueo. Para llegar a un doble negocio haría falta además un insert anterior todavía en viaje: ventana mínima, no se cerró.
- **Mediciones de prod del debug, pendientes:** el disparador real del 2026-11-19 sigue sin confirmar. Ver `prod_measurements_proposed` en `.planning/debug/onboarding-guardando-colgado.md` (queries 1-3, logs 4-5 y la pregunta al dueño).

## Guion de UAT (en el teléfono, después del deploy)

1. Con una cuenta nueva, completá el wizard y tocá «Crear mi negocio» con buena señal. Tiene que salir el toast «¡Negocio creado con éxito!» y tiene que llevarte al paso 5 (Integraciones).
2. Con otra cuenta nueva, completá el wizard, tocá «Crear mi negocio» y poné el teléfono en **modo avión** enseguida. En unos 20 s tiene que aparecer el aviso rojo arriba de los botones, con el mismo texto en un toast, y el botón tiene que decir «Reintentar». «Atrás» queda deshabilitado.
3. Sacá el modo avión y tocá «Reintentar». Tiene que llevarte al paso 5.
4. Entrá al panel: tiene que haber **un solo** negocio, con sus servicios, profesionales y horarios cargados una vez (sin duplicados).

## Known Stubs

Ninguno.

## Threat Flags

Ninguno nuevo. No hay endpoint, server action, migración ni secreto nuevo. La búsqueda nueva usa el cliente de sesión (RLS `owner access`), filtra por el `owner_id` de `getUser()` y pide `select('id, slug')` explícito (T-iu8-03). `leerConfiguracionDelNegocio` filtra cada lectura por `business_id`, siempre de un negocio que ya devolvió la búsqueda del dueño.

## Self-Check: PASSED

- Archivos: `lib/con-limite.ts`, `lib/con-limite.test.ts`, `lib/onboarding-alta.ts`, `lib/onboarding-alta.test.ts`, `app/(onboarding)/onboarding/page.tsx`, `test/onboarding-finish-loading.test.ts`, `.planning/debug/probes/onb-crear-negocio-colgado.mjs`: presentes.
- Commits `5ec62c2`, `784d2de`, `cfae9b3`, `94685fd`, `4cc7ccc`, `f7ee7dd`, `55547fc`: presentes en `git log`.
