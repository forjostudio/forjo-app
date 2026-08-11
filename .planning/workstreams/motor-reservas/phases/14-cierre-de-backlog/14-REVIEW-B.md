---
phase: 14-cierre-de-backlog
cluster: B — abonos, settings, agenda, clientes y la migración 066
reviewed: 2026-08-11T00:00:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - app/api/abonos/cancel-link/[id]/route.ts
  - supabase/migrations/066_abono_delete_gate.sql
  - app/(dashboard)/abonos/abonos-client.tsx
  - app/(dashboard)/settings/settings-client.tsx
  - app/(dashboard)/agenda/agenda-client.tsx
  - app/(dashboard)/clients/clients-client.tsx
  - components/dashboard/active-tabs.tsx
  - components/dashboard/canchas-manager.tsx
  - components/dashboard/nuevo-abono-form.tsx
  - components/dashboard/nuevo-turno-form.tsx
  - lib/client-status.ts
  - test/abono-delete-gate.test.ts
  - test/client-status.test.ts
findings:
  critical: 1
  warning: 7
  info: 7
  total: 15
status: issues_found
---

# Phase 14 — Code Review Report (cluster B)

**Reviewed:** 2026-08-11
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

Se auditó el cluster B contra el diff `21722ab..HEAD` (rango completo de la fase 14). Lo que el
cluster afirma haber cerrado, está cerrado en su eje principal:

- El gate de POLISH-06 (`.neq('status','cancelled')` **dentro** de la query) es correcto: `status` es
  `NOT NULL` con `CHECK` de tres valores (`supabase/schema.sql:531,542`), así que el filtro de
  desigualdad no puede perder filas por NULL, y los tres caminos de rechazo comparten cuerpo y status.
  No hay diferencia de mensaje ni de forma de query entre "ajena", "inexistente" y "dada de baja".
- El aislamiento por tenant del endpoint es correcto y doble (sesión anon+RLS + `.eq('business_id')`),
  y el negocio se resuelve por `owner_id` del actor, nunca por un dato de la request.
- El trigger de la 066 respeta el orden `cascade-guard → regla → RETURN OLD`, no puede cancelar el
  borrado en silencio, y su mensaje es un código de dominio fijo sin datos del negocio.
- La extracción de `active-tabs.tsx` no perdió comportamiento: `visible`, `counts`, el markup de las
  píldoras y el panel de estado vacío son equivalentes byte a byte a lo que tenía Servicios.
- La limpieza de `showExtra`/`proExtraOpen`/`ServiceTab`/`SERVICE_TABS` en `settings-client.tsx` es
  completa (0 referencias huérfanas), y los campos que quedaron visibles siguen cableados: el alta
  hace `insert({ ...proToPayload(newPro), business_id })` y `proToPayload` normaliza `phone`/`email`
  (`settings-client.tsx:60-70,781`).
- No se encontró ninguna query del dashboard nueva o modificada sin su `.eq('business_id', …)`.

Lo que **no** está cerrado se concentra en tres focos: (1) la respuesta que entrega la credencial
permanente sale sin directiva de caché, que es justamente el vector que WR-07/D-25 existen para
cerrar; (2) el endpoint no distingue "falla de infraestructura" de "no existe" y no loguea nada, así
que la emisión de una credencial permanente no deja rastro; (3) el pre-check destructivo de
`canchas-manager` es fail-open, que es la misma lección que la Phase 13 ya había pagado (WR-02).

---

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: la credencial permanente de baja se entrega sin `Cache-Control: no-store`

**File:** `app/api/abonos/cancel-link/[id]/route.ts:88`

**Issue:** El handler devuelve `Response.json({ ok: true, url })` **sin ninguna cabecera de caché**.
El cuerpo contiene la URL que embebe `abonos.cancel_token`, una credencial que —según el propio
comentario del archivo (`:15-16`) y `app/api/abonos/cancel/[token]/route.ts:33`— **no rota ni vence**,
o sea que cualquier fuga es permanente.

La cabecera del archivo declara textualmente que la razón de ser del endpoint on-demand es sacar esa
credencial de "la caché del navegador, el bfcache y cualquier captura de DOM" (`:11-17`). El diseño
mueve el secreto del payload RSC a una respuesta HTTP… que tampoco declara que no se debe almacenar.
Según `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md:51`, Next no cachea
los `GET` Route Handlers **del lado del servidor**, pero eso no dice nada sobre el store HTTP del
navegador ni sobre cachés compartidas intermedias: una respuesta sin directivas queda a merced del
default del edge/proxy, y un `public, max-age=0, must-revalidate` (default habitual de plataforma
para dinámico) autoriza a una caché compartida a **almacenar** el cuerpo.

Esto no es teórico para este repo: la convención ya existe y se aplica a endpoints mucho menos
sensibles — `app/api/onboarding/slug-available/route.ts:48`, `app/api/booking/availability/route.ts:242,355,439`,
`app/api/agent/context/route.ts:56` y `app/api/agent/inbox/state/route.ts:51` todos setean
`Cache-Control: no-store` explícito. El único endpoint del repo que devuelve un secreto es el único
que no lo hace.

**Fix:**

```ts
return Response.json(
  { ok: true, url: `${appBase}/abono/cancelar/${token}` },
  { headers: { 'Cache-Control': 'no-store, private, max-age=0' } },
)
```

Conviene aplicar la misma cabecera a las cuatro ramas de 404/401 (son baratas y evitan que una
respuesta de rechazo quede cacheada y enmascare un cambio de estado posterior de la serie).

---

## Warnings

### WR-01: el endpoint descarta TODOS los errores de Supabase y no loguea nada

**File:** `app/api/abonos/cancel-link/[id]/route.ts:59-64,71-78`

**Issue:** Las dos queries desestructuran solo `data` y tiran el `error` al piso:

```ts
const { data: business } = await supabase.from('businesses')...
const { data: abono }    = await supabase.from('abonos')...
```

Consecuencias concretas:

1. Una falla de infraestructura (Postgres caído, PostgREST sin schema cache tras un DDL, `PGRST301`
   por JWT expirado, `22P02` por un id que no es UUID) se convierte en un `404 not_found`
   indistinguible de "esa serie no es tuya". El dueño ve "No se pudo obtener el link de baja"
   (`abonos-client.tsx:187`) y nadie se entera de que el sistema está roto.
2. **No hay ningún rastro de la emisión de una credencial permanente.** Ni éxito ni fallo. Este es el
   único endpoint del panel que reparte un secreto de larga vida y no deja línea de log ni entrada de
   auditoría, así que ante un incidente ("¿este link salió de acá o de la fuga vieja del payload
   RSC?") no hay forma de responder.
3. Viola la convención explícita del repo (`AGENTS.md` / `.claude/CLAUDE.md` §Logging: "Logging de
   fallas server-side con prefijo de módulo: `console.error('[modulo/accion]', …)`"). Todos los demás
   route handlers de abonos la cumplen.

**Fix:**

```ts
const { data: business, error: bizErr } = await supabase
  .from('businesses').select('id').eq('owner_id', user.id).maybeSingle()
if (bizErr) {
  console.error('[abonos/cancel-link] business lookup:', bizErr.message)
  return Response.json({ ok: false, error: 'server_error' }, { status: 500 })
}
if (!business) return Response.json({ ok: false, error: 'not_found' }, { status: 404 })

const { data: abono, error: abonoErr } = await supabase.from('abonos')...
if (abonoErr && abonoErr.code !== '22P02') {           // 22P02 = id no-UUID ⇒ 404 legítimo
  console.error('[abonos/cancel-link] abono lookup:', abonoErr.message)
  return Response.json({ ok: false, error: 'server_error' }, { status: 500 })
}
if (!abono) return Response.json({ ok: false, error: 'not_found' }, { status: 404 })

// y en el camino feliz, una línea SIN el token:
console.error('[abonos/cancel-link] emitido', { abonoId: id.trim(), businessId: business.id })
```

> Nota de diseño: devolver `500` en falla de infra **no** rompe el requisito de 404 genérico de
> D-22/D-23. El oráculo de existencia que hay que evitar es entre "ajena" y "propia dada de baja", y
> las dos siguen cayendo en el mismo `404 not_found`. Un 500 por caída de Postgres no revela nada
> sobre qué series existen. Si se prefiere no introducir un status nuevo, al menos el `console.error`
> es innegociable.

### WR-02: `maybeSingle()` sobre `businesses` convierte un negocio duplicado en un 404 permanente y mudo

**File:** `app/api/abonos/cancel-link/[id]/route.ts:59-64`

**Issue:** `.eq('owner_id', user.id).maybeSingle()` devuelve `{ data: null, error: PGRST116 }` cuando
la query matchea **más de una fila**. Como el `error` se descarta (WR-01), un dueño que llegue a
tener dos filas en `businesses` con su `owner_id` recibe `404 not_found` **para siempre** en esta
función, sin ninguna señal de por qué. No hay constraint `UNIQUE` sobre `businesses.owner_id` en
`supabase/schema.sql`, así que el estado es alcanzable (el propio historial del proyecto registra
colisiones de alta en onboarding).

El resto del panel resuelve el negocio de la misma forma, así que la falla sería sistémica y no de
este endpoint — pero acá es donde se manifiesta como "el botón no anda nunca y no dice nada".

**Fix:** ordenar y acotar a una fila explícitamente, y loguear el caso ambiguo:

```ts
const { data: businesses, error } = await supabase
  .from('businesses').select('id').eq('owner_id', user.id).order('created_at').limit(2)
if (error) { console.error('[abonos/cancel-link] business lookup:', error.message); /* 500 */ }
if ((businesses?.length ?? 0) > 1) console.error('[abonos/cancel-link] owner con >1 negocio:', user.id)
const business = businesses?.[0]
```

### WR-03: el gate de la 066 es esquivable en dos llamadas y deja un estado que la UI nunca produce

**File:** `supabase/migrations/066_abono_delete_gate.sql:78-80`
**(requiere una migración correctiva — la 066 ya está aplicada en prod, NO editar el archivo)**

**Issue:** La cabecera de la migración afirma que "la BASE es la autoridad" y que el trigger "resiste
un DELETE directo por PostgREST que saltee la UI" (`:9-12`). Eso es cierto para **un** DELETE, pero el
mismo actor tiene una policy de `UPDATE` por tenant sobre la misma tabla
(`supabase/schema.sql:1857` — `abonos tenant update`), así que dos llamadas de PostgREST lo esquivan:

```
PATCH  /rest/v1/abonos?id=eq.<uuid>   {"status":"cancelled"}
DELETE /rest/v1/abonos?id=eq.<uuid>
```

El problema no es de aislamiento (es su propia serie, su propio tenant), es de **consistencia**: la
baja legítima corre por `app/api/abonos/cancel` → `lib/abono-cancel.ts`, que además de mover el
estado **cancela los turnos futuros de la serie**. Este camino no. Resultado: los turnos futuros
sobreviven vivos y, tras el DELETE, con `abono_id = NULL` (`ON DELETE SET NULL`, migr. 054), o sea
turnos reservados sin serie que los explique — un estado que ninguna ruta de la aplicación puede
generar y que los reportes/Finanzas no saben interpretar.

No es un blocker (no cruza tenants, no destruye datos, requiere una request a mano), pero la
afirmación "la BASE es la autoridad" debe corregirse o la invariante debe hacerse real.

**Fix (migración 067 correctiva, una de las dos):**

```sql
-- Opción A (mínima): dejar por escrito que el gate cubre el DELETE, no la transición de estado.
--   → editar el comentario de la 066 en supabase/schema.sql y en el header del plan.

-- Opción B (real): trigger BEFORE UPDATE que exija pasar por el motor de baja al archivar,
-- p. ej. exigiendo que 'active' → 'cancelled' venga acompañado de cancelled_at y que no queden
-- turnos futuros vivos de la serie.
CREATE OR REPLACE FUNCTION public.abonos_block_orphan_archive() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status = 'active' AND NEW.status = 'cancelled'
     AND EXISTS (
       SELECT 1 FROM appointments a
        WHERE a.abono_id = OLD.id
          AND a.date >= (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
          AND (a.status IS NULL OR a.status NOT IN ('cancelled','completed'))
     ) THEN
    RAISE EXCEPTION 'abono_has_live_future_turns' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END; $$;
```

### WR-04: el pre-check del hard-delete de una cancha es **fail-open**

**File:** `components/dashboard/canchas-manager.tsx:175-181`

**Issue:**

```ts
const { count } = await supabase.from('appointments')
  .select('id', { count: 'exact', head: true })
  ...
setDelPending(count ?? 0)
```

El `error` se descarta y `count` es `null` cuando la query falla (o cuando PostgREST no puede
resolver el `count`). El `?? 0` traduce esa falla a **"0 reservas próximas"**, y el modal pasa a
mostrar la copy tranquilizadora `"Vas a eliminar "X" de forma permanente. No se puede deshacer."`
(`:225`) en vez del `⚠ … tiene N reserva(s) próxima(s)` (`:224`).

Esta es exactamente la lección que la Phase 13 ya pagó y arregló para el borrado de servicio
(commit `d6c8ef8` — "WR-02 no tratar un pre-check fallido como 'nada que perder'"). El molde
regresó acá.

Atenuante: el borrado en sí **no** es fail-open — `deleteCancha` con `hard:true` se apoya en el FK
`23503` de `appointments.professional_id` (`lib/canchas.ts:214-221`), así que la base sigue
rechazando. El daño es que el dueño confirma un hard-delete creyendo que no pierde nada.

**Fix:**

```ts
const { count, error } = await supabase.from('appointments')...
if (error) { setDelPending(-1); return }   // -1 = desconocido
```

y una tercera rama en `delDescription`:

```ts
: delPending < 0
  ? `No se pudo verificar si "${delCancha.service.name}" tiene reservas próximas. Eliminarla es permanente. Si querés conservar el historial, desactivala. Para eliminar igual, escribí ELIMINAR.`
```

### WR-05: el `ConfirmDialog` de la cancha se puede confirmar antes de que llegue el pre-check

**File:** `components/dashboard/canchas-manager.tsx:170-182,220-226,390-400`

**Issue:** `openDelete` abre el diálogo (`setDelCancha(c)`) y **después** hace la query de conteo. Con
`delPending === null` el diálogo ya está montado, con la descripción "Verificando reservas…" y con el
botón confirmar **habilitable**: basta escribir `ELIMINAR` antes de que resuelva la query (trivial en
una conexión lenta, y es la acción muscular de alguien que ya borró canchas antes) para que el aviso
`⚠ N reserva(s) próxima(s)` no se vea nunca. El `ConfirmDialog` no ofrece ningún gating por estado
de carga del caller.

**Fix:** usar el `hideConfirm` que el componente ya expone (`components/crm/confirm-dialog.tsx:78`)
mientras el pre-check está en vuelo:

```tsx
<ConfirmDialog
  ...
  hideConfirm={delPending === null}
  description={delDescription}
/>
```

### WR-06: el fallback de "Copiar link" pinta la credencial permanente en el DOM

**File:** `app/(dashboard)/abonos/abonos-client.tsx:194-198`

**Issue:**

```ts
} catch {
  toast.error('No se pudo copiar automáticamente. Copiá este link:', { description: url })
}
```

Cuando `navigator.clipboard` no está disponible (contexto no seguro, permiso denegado, WebView), el
token se **renderiza como texto visible** en un toast. Eso es literalmente el vector que la cabecera
del endpoint enumera como motivo de existir: "en cualquier captura de DOM: session replay, reporte de
errores, screenshot de soporte, sesión de impersonación" (`app/api/abonos/cancel-link/[id]/route.ts:13-15`).
Sonner mantiene el toast 4-6s en el DOM y las herramientas de session replay capturan el árbol
completo salvo que se marquen los nodos como sensibles.

No lo introdujo esta fase, pero convive en el mismo archivo con el endurecimiento de POLISH-06 y lo
contradice.

**Fix:** no mostrar el link. Ofrecer un reintento, o un input `readOnly` con `data-sr-mask`/
`data-private` (según lo que se instrumente) y auto-`select()`, en vez de texto libre en un toast:

```ts
toast.error('No se pudo copiar automáticamente. Volvé a intentar desde una conexión segura (https).')
```

### WR-07: `classifyClient` recibe días **negativos** y no tiene contrato para eso

**File:** `lib/client-status.ts:36-42`, `app/(dashboard)/clients/clients-client.tsx:415-419`

**Issue:** El caller cuenta como "visitas" los turnos en estado `confirmed`/`completed` **sin filtrar
por fecha**:

```ts
const confirmed = all.filter(a => ['confirmed', 'completed'].includes(a.status))
const visits = confirmed.length
const lastDate = sorted[0]?.date ?? null              // puede ser una fecha FUTURA
const daysSinceLast = lastDate ? differenceInDays(now, parseISO(lastDate)) : 999
```

Un cliente creado hoy con una sola reserva `confirmed` para dentro de un mes entra al helper como
`{ visits: 1, daysSinceLast: -30 }`. `classifyClient` lo clasifica `'new'` por la cascada de visitas,
así que hoy no rompe — pero:

- el "último" que muestra la ficha es una fecha **futura** presentada como visita pasada
  (`fmtLastVisit`, `clients-client.tsx:146-154`), y
- la extracción de POLISH-07 **congeló** ese contrato sin documentarlo ni testearlo: el JSDoc de
  `classifyClient` habla de "cuántos días pasaron desde la última [visita]" y de un único sentinela
  (999), y no menciona que el parámetro puede ser negativo. La próxima persona que agregue una rama
  por días (p. ej. "visitó hace poco") va a asumir `daysSinceLast >= 0`.

El sentido de POLISH-07 era tener una fuente única y confiable de la regla; dejar un dominio de
entrada no especificado la deja a medio hacer.

**Fix:** o el caller no cuenta turnos futuros como visitas, o el helper declara y normaliza el dominio.
La segunda es de una línea y no toca el resto del archivo:

```ts
export function classifyClient({ visits, daysSinceLast }: { visits: number; daysSinceLast: number }): ClientStatusKey {
  if (!(visits > 0)) return 'new'                 // cubre 0, negativos y NaN
  const days = Number.isFinite(daysSinceLast) ? Math.max(0, daysSinceLast) : 0
  if (days > PAUSED_AFTER_DAYS) return 'paused'
  ...
}
```

y sumar el caso al JSDoc + a `test/client-status.test.ts`.

---

## Info

### IN-01: rama muerta y grant por defecto en la 066

**File:** `supabase/migrations/066_abono_delete_gate.sql:56-59,41-42,90`

`abonos.business_id` es `uuid NOT NULL` (`supabase/schema.sql:522`), así que la condición
`OLD."business_id" IS NOT NULL` nunca puede ser falsa: es un calco de la 065, donde `services` sí
tiene filas legacy sin negocio y la rama era necesaria (`065:249,254`). Acá es ruido que sugiere una
nulabilidad que no existe.

Aparte, la función es `SECURITY DEFINER` con `OWNER TO postgres` y la migración no hace
`REVOKE EXECUTE ON FUNCTION public.abonos_block_delete() FROM PUBLIC`. No es explotable —Postgres
rechaza invocar una función `RETURNS trigger` fuera de un trigger— pero es superficie privilegiada
gratuita. Si se hace la migración correctiva de WR-03, conviene incluir el `REVOKE` de las dos
funciones (065 y 066) y borrar la rama muerta con un `CREATE OR REPLACE`.

### IN-02: `active-tabs` promete una memoización que uno de los dos consumidores no obtiene

**File:** `components/dashboard/active-tabs.tsx:52-54`, `components/dashboard/canchas-manager.tsx:60,66`

El JSDoc del hook pide declarar `isActive` a nivel de módulo "para que los `useMemo` no se
invaliden en cada render", y el call-site de canchas lo cumple (`isCanchaActive` es de módulo). Pero
la otra dependencia se recalcula sin memo en cada render:

```ts
const canchas = canchasFromData(services, professionals, agendaSpaces)   // identidad nueva cada render
const { ... } = useActiveTabs(canchas, isCanchaActive)
```

`items` cambia de identidad siempre, así que los dos `useMemo` del hook se invalidan igual y la
disciplina del predicado a nivel de módulo no compra nada acá. Servicios sí lo obtiene
(`manageableServices` está memoizado, `settings-client.tsx:866-869`). Envolver `canchas` en un
`useMemo([services, professionals, agendaSpaces])` alinea el call-site con lo que el módulo documenta.

### IN-03: `clients-client.tsx` duplica el union en vez de importarlo

**File:** `app/(dashboard)/clients/clients-client.tsx:43`, `lib/client-status.ts:11`

`type StatusKey = 'new' | 'active' | 'frequent' | 'paused'` es una segunda declaración del mismo
concepto que `ClientStatusKey`. Coincide hoy por casualidad estructural; el objetivo declarado de
POLISH-07 era una fuente única. `import { classifyClient, type ClientStatusKey } from '@/lib/client-status'`
y `type StatusKey = ClientStatusKey` (o el reemplazo directo) cierra el hueco sin tocar
`STATUS_DOT`/`STATUS_LABEL`.

### IN-04: huecos de cobertura en `test/client-status.test.ts`

**File:** `test/client-status.test.ts:21-65`

Falta el caso que produce el caller real (`daysSinceLast` negativo por un turno futuro, ver WR-07),
el no-finito (`NaN` si `parseISO` falla), y la interacción entre el guard de visitas y el umbral en su
punto más frágil: `{ visits: 1, daysSinceLast: 61 }` (debe dar `'paused'`, no `'new'`) — hoy el único
caso de pausa con pocas visitas usa `visits: 3`.

### IN-05: `test/abono-delete-gate.test.ts` no prueba el rechazo por el camino de producción

**File:** `test/abono-delete-gate.test.ts:125-135,239-246`

El caso 1 (serie activa ⇒ `P0001 / abono_is_active`) corre con `t.admin` (**service-role**). El caso 7
prueba la sesión anon del dueño, pero solo sobre una serie **cancelled** (camino feliz). No hay ningún
caso que combine sesión anon + serie **activa**, que es exactamente lo que emite el panel
(`abonos-client.tsx:254`) cuando el backstop de `onConfirm` tiene que disparar. Un caso 8 de tres
líneas (seed `active` en `other`, delete con `otherOwnerSession`, esperar `P0001`) cerraría el contrato
completo entre el trigger y el mapeo del cliente.

### IN-06: fricción de confirmación inconsistente entre tres borrados igual de permanentes

**Files:** `app/(dashboard)/abonos/abonos-client.tsx:668-674` · `components/dashboard/canchas-manager.tsx:395` · `app/(dashboard)/settings/settings-client.tsx` (borrado de servicio)

Tres acciones irreversibles del mismo panel usan tres niveles distintos: borrar una serie de abono y
borrar un servicio son nivel **simple**; borrar una cancha exige tipear `ELIMINAR`. La cancha es la
única de las tres que **sí** conserva un gate en la base contra reservas vivas, o sea que la que más
protegida está es la que más fricción pide. No es un bug, pero la inconsistencia enseña mal el
lenguaje de la interfaz. Vale una decisión explícita del dueño en la próxima UAT.

### IN-07: cambios de POLISH-04 que el propio commit deja sin verificar

**File:** `app/(dashboard)/agenda/agenda-client.tsx:1035-1048`

El comentario admite en el código que el efecto de `w-full sm:w-auto` sobre los tres botones del panel
lateral queda "a mirar en la UAT visual". Verificado el markup: el contenedor es `lg:w-64`, así que en
el rango 640px–1024px el panel es de ancho completo y los botones quedan por contenido (correcto), y
recién desde `lg` viven en la columna de 256px, donde "Aplicar horario especial" ocupa casi todo el
ancho útil igual. El riesgo real es bajo, pero el ítem sigue sin cerrar formalmente.

Colateral menor del mismo bloque: el panel se apaga con `opacity-50 pointer-events-none`
(`:1007`), que **no** saca los botones del orden de tabulación — un usuario de teclado puede enfocarlos
y activarlos. Los tres handlers están guardados con `if (dates.length === 0) return`
(`:414,423,433`), así que es inerte, pero el foco cae en controles que no responden ni dan feedback.
`aria-hidden` + `inert` (o `disabled` en los botones) lo resuelve.

---

_Reviewed: 2026-08-11_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
_Cluster: B — abonos, settings, agenda, clientes y la migración 066_
