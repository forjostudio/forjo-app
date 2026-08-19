---
phase: 16-correcciones-del-gate
workstream: motor-reservas
milestone: v0.27
secured: 2026-08-18
status: open-threats
blocking: false
asvs_level: 2
block_on: high
register_authored_at_plan_time: true
threats_total: 19
threats_closed: 18
threats_open: 1
threats_mitigate: 17
threats_accept: 2
threats_transfer: 0
unregistered_flags: 2
commit_range: 06229f1..5ff8ae7
audit_rounds:
  - date: 2026-08-18
    scope: "planes 16-01 y 16-02 · T-16-01…T-16-18 + T-16-SC (19) · verificación por INSTALACIÓN sobre pg_proc + repro adversarial propio contra el Postgres local · rango 06229f1..5ff8ae7"
    verdict: "18/19 CLOSED (16 mitigate verificadas contra los cuerpos INSTALADOS y contra el comportamiento medido, 1 mitigate supply-chain, 1 accept registrada) · **T-16-05 OPEN**: su premisa de aceptación es FALSA — el rol `anon` SÍ puede crear turnos con fecha/hora pasada, medido. 2 hallazgos fuera de register (WARNING, ambos PRE-EXISTENTES)"
---

# Phase 16 — Correcciones del gate · Auditoría de seguridad

**Veredicto: 18/19 amenazas CERRADAS. 1 ABIERTA (T-16-05, disposición `accept` con premisa falsificada).
2 hallazgos fuera de register, los dos PRE-EXISTENTES y NO regresiones de esta fase.**

| Ítem | Valor |
|---|---|
| Amenazas declaradas | **19** — T-16-01…T-16-11 + T-16-SC (16-01) y T-16-12…T-16-18 + T-16-SC (16-02); `T-16-SC` está en los dos planes y es **una sola** |
| Cerradas | **18/19** |
| Abiertas | **1** — `T-16-05` |
| Fuera de register | **2** — `X-16-A` (RPC `book_slot_atomic` ejecutable por `anon` sin ventana de reserva) y `X-16-B` (el filtro por tenant del gate se puede esquivar moviendo `services.business_id`) |
| ¿Bloquea el cierre de la fase? | **No.** El código de la fase no tiene ninguna mitigación ausente. Lo que falla es la **premisa** de un riesgo aceptado, y los dos hallazgos son anteriores a la 070 |

## Postura y método

Postura adversarial: cada mitigación se asume **ausente** hasta que una medición la prueba. En esta
fase eso obligó a tres cosas:

1. **Verificación por INSTALACIÓN, no por archivo.** Todo lo que se afirma sobre los dos gates se
   comprobó sobre `pg_proc.prosrc` / `pg_get_function_arguments` del Postgres local, no sobre el
   `.sql`. (La propia fase ya había aprendido la diferencia: un comentario del cuerpo vive dentro de
   `prosrc`.)
2. **Repro adversarial propio**, escrito por esta auditoría y distinto del de 16-01: cadenas de PATCH
   pensadas para **romper** el argumento de T-16-10, no para confirmarlo.
3. **Ataque a la disposición `accept`.** T-16-05 se aceptó sobre una afirmación fáctica verificable
   ("ninguna superficie anónima puede crear turnos en el pasado"). Se verificó. Es falsa.

Todo lo medido corrió contra el Postgres **local** (`supabase_db_forjo-app`, PG17, con la 070
aplicada), siempre dentro de `BEGIN … ROLLBACK`. **No se ejecutó una sola query contra producción**
y la 070 **sigue sin aplicarse** allí (D-08).

---

## 1. Registro de amenazas — verificación por plan

### Plan 16-01 — Migración 070 (los dos gates)

| ID | Categoría | Disp. | Estado | Evidencia |
|---|---|---|---|---|
| T-16-01 | Tampering | mitigate | **CLOSED** | Criterio **nominal** presente en el cuerpo INSTALADO: `IF OLD."capacity_mode" = 'individual' THEN RETURN NEW; END IF;` (`pg_proc.prosrc` de `services_block_mode_change`). Y las **dos** patas del argumento, medidas por esta auditoría: (a) tras `individual → group_class` el turno preexistente **sigue con `is_group = false`** (repro propio, fila `9 is_group de A1` → `false`) ⇒ sigue dentro del EXCLUDE gist 013; (b) esa fila **sí se cuenta** contra el cupo nuevo — el count de la rama `group_class` de `book_slot_atomic` instalado filtra por `business_id + bucket + date + time + status IN ('confirmed','pending_payment')` y **no** filtra por `is_group`. Ninguna fila queda huérfana de guards. Test 8 (`capacity-mode-change-gate`) asierta lo mismo. |
| T-16-02 | Tampering | mitigate | **CLOSED** | Medido **por comportamiento**, dirección por dirección, contra la base real (repro propio): `group_class → individual` ⇒ `RECHAZO P0001 / service_mode_has_future_appointments`; `simultaneous_resource → group_class` ⇒ RECHAZO; `group_class → individual` con `capacity_mode` y `capacity` en el **mismo statement** ⇒ RECHAZO; `UPDATE` **multi-fila** que baja dos servicios peligrosos a la vez ⇒ RECHAZO. R-1 sigue cerrado en las cuatro. Tests 1, 3, 10 y 11. |
| T-16-03 | Tampering | mitigate | **CLOSED** | Cuerpo INSTALADO del gate de modo: `AND (a."status" IS NULL OR a."status" <> 'cancelled')` — `completed` ya **no** sale del `EXISTS`. Es literalmente la condición de cierre que `15-SECURITY.md §4` había registrado para **R-15-A**. Caso 4 del A/B (PASA → RECHAZO) y test 12, que además cayó con el predicado viejo en el A/B de 16-02. |
| T-16-04 | Tampering (integridad) | mitigate | **CLOSED** | Divergencia **instalada** y verificada en los dos cuerpos: borrado → `NOT IN ('cancelled', 'completed')`; modo → `<> 'cancelled'`. Escrita en el header de la 070, espejada en `supabase/schema.sql` (`<> 'cancelled'` == 1, `NOT IN (...)` == 2: el gate de abonos + el de borrado) y con **un testigo por lado** en los tests (`grep -ci diverg` → 2 en el gate de modo, 1 en el de borrado), cada uno referenciando al otro. |
| T-16-05 | Tampering | **accept** | 🛑 **OPEN** | **La premisa de la aceptación es falsa.** Ver §2.4 y §3.1. Medido: el rol `anon` puede crear turnos con fecha **30 días en el pasado** y de **hoy a hora ya pasada** vía `rpc/book_slot_atomic`. La condición de reapertura registrada ("reabrir si alguna superficie **no autenticada** pudiera crear turnos con fecha/hora pasada") **se cumple**. |
| T-16-06 | Elevation of Privilege | mitigate | **CLOSED** | Verificado sobre los **cuerpos instalados**, no sobre el archivo: `AND (OLD."business_id" IS NULL OR a."business_id" = OLD."business_id")` presente en **las dos** funciones. `pg_proc.prosecdef = t` en las dos y `proconfig = {search_path=public}` en las dos. En el archivo, el mismo filtro aparece **2** veces. ⚠ Ver `X-16-B` (§3.2): el filtro **está**, pero se puede esquivar moviendo la fila de tenant — hallazgo pre-existente, no una pérdida introducida acá. |
| T-16-07 | Information Disclosure | mitigate | **CLOSED** | Los `RAISE` instalados son literales fijos, sin `%` ni interpolación: `service_has_future_appointments`, `service_has_active_abono`, `service_mode_has_future_appointments`. **Cero códigos nuevos** y cero renombres ⇒ el mapeo del panel (`code === 'P0001' && message.includes(...)`) sigue válido. `git diff --name-only 06229f1..HEAD` no incluye **ningún** archivo de `app/`. |
| T-16-08 | DoS (integridad) | mitigate | **CLOSED** | Sobre los **cuerpos instalados**, con los comentarios removidos: `RETURN NULL` → **0 ocurrencias en las dos funciones**. En el archivo: `RETURN NEW;` == 3 (guard de no-cambio + guard de dirección + cierre) y `RETURN OLD;` == 2 (guard de cascada + cierre). Por comportamiento: el test 2 escribe y **relee la fila** con `modeOf` (service-role) — un 204 silencioso con la fila sin cambiar lo pondría en rojo. |
| T-16-09 | Tampering | mitigate | **CLOSED** | `^(BEGIN\|COMMIT);` == **2** (líneas 159 y 354) y `NOTIFY pgrst` en la **357**, posterior al `COMMIT`. `DROP TRIGGER` == 0 y `CREATE TRIGGER` == 0. Re-corribilidad **re-verificada por esta auditoría**: el archivo aplicó **dos veces seguidas** con exit 0 y `pg_proc` volvió a dar `t\|t` en las dos funciones. |
| T-16-10 | Tampering | mitigate | **CLOSED** | Ver §2.1 — es el foco principal de esta auditoría y se intentó **romper**, no confirmar. Las cadenas `individual → group_class → individual` y `individual → simultaneous_resource → group_class` **rebotan en el segundo paso** con el código de dominio correcto. La condición de reapertura registrada ("reabrir si el guard decide por `NEW.capacity_mode` o por una historia de cambios en vez de por `OLD`") **no se cumple**: el cuerpo instalado lee `OLD."capacity_mode"` y nada más. |
| T-16-11 | Tampering | mitigate | **CLOSED** | `grep -c 070` → **3** en `lib/appointment-time.ts` y **1** en `lib/types.ts`; `grep -ci "DIVERGENCIA CONOCIDA"` → **0**. Y el criterio duro: `git diff -U0 06229f1..HEAD -- lib/ \| grep -E '^[+-][^+-]' \| grep -vcE '^[+-]\s*(//\|\*\|/\*)'` → **0** líneas de código tocadas. Solo comentarios. |
| T-16-SC | Tampering (supply chain) | mitigate | **CLOSED** | `git diff --name-only 06229f1..HEAD` no incluye `package.json` ni `package-lock.json`. Cero paquetes nuevos. |

### Plan 16-02 — Tests por dirección + runbook

| ID | Categoría | Disp. | Estado | Evidencia |
|---|---|---|---|---|
| T-16-12 | Tampering | mitigate | **CLOSED** | El A/B a nivel suite está corrido y **declarado caso por caso** en `16-02-SUMMARY.md`, con los 5 discriminantes nombrados y los invariantes separados. Corroboración independiente de esta auditoría en la capa SQL: la sección `## ANTES` de `16-BASELINE-070.md` mide el predicado viejo con SQLSTATE y código de dominio literales, y los casos 1, 4, 5 y 6 flipean. Re-corrí las dos suites: **27 passed \| 1 expected fail (28)**, 0 skips. |
| T-16-13 | Tampering | mitigate | **CLOSED** | `modeOf()` / `isGroupOf()` / `serviceExists()` releen el **estado real** con service-role tras cada intento, y cada caso siembra su propio service. Un `UPDATE` que no matchea ninguna fila no puede pasar por verde. |
| T-16-14 | Elevation of Privilege | mitigate | **CLOSED** | Los **dos** guards anti-falso-verde siguen en el `beforeAll` (`capacity-mode-change-gate.test.ts:106-118`): aborta si el cliente de aserción no tiene sesión anon, y aborta si `NEXT_PUBLIC_SUPABASE_ANON_KEY === SUPABASE_SERVICE_ROLE_KEY`. El caso 6 escribe con `otherOwnerSession` (anon key + sesión real), no con service-role, y conserva el **contrapeso** (la misma sesión sí escribe sobre lo propio). |
| T-16-15 | Tampering | mitigate | **CLOSED** | Matriz completa por dirección: casos **8** y **9** (seguras, pasan) y **10** y **11** (peligrosas, rechazan), más los re-anclados 1, 2 y 3. `grep -c "capacity_mode: 'simultaneous_resource'"` → **4**; `grep -c is_group` → **16**. Verificado además por comportamiento en el repro propio de §2.2. |
| T-16-16 | DoS (integridad) | mitigate | **CLOSED** | Guard de medianoche que **tira** (no skipea) en los dos archivos: `throw new Error('GUARD DE MEDIANOCHE: …')` fuera de `[01:00:00, 23:30:00]` AR, con `PAST_TIME_TODAY` / `FUTURE_TIME_TODAY` derivadas de `nowInAR` — la misma fuente que usa la UI. `grep -c 23:30` → 3 y 3. |
| T-16-17 | Repudiation | mitigate | **CLOSED** | `16-RUNBOOK-070.md`: `pg_proc` **6**, `pg_trigger` **1**, `ABORTAR` **5**, `db push` **2**, `rollback` **3**, `R-15-A` **2**, `NO APLICADA` **1**, `070` **20**. El rollback nombra **las dos** funciones con su migración de origen (065 y 068) y declara qué se pierde al revertir. |
| T-16-18 | Information Disclosure | **accept** | **CLOSED** | Registrada en §4. Verificado: prefijo `__test_` (10/15/15 ocurrencias) y `teardownOneTenant` borra `businesses` por cascada con `try/finally` + `auth.admin.deleteUser`. Corre contra el Supabase local; sin creds la suite se skipea (y un skip no cuenta como verde, declarado). |
| T-16-SC | Tampering (supply chain) | mitigate | **CLOSED** | Misma evidencia que en 16-01. |

---

## 2. Los cinco focos del encargo

### 2.1 Foco 1 — T-16-10: ¿el guard de dirección se puede encadenar? → **NO** (intentado, no logrado)

`15-SECURITY.md §4` dejó escrita la condición de reapertura de T-15-06: *"reabrir si el gate pasa a
mirar **transiciones** en vez de estado final"*. GATE-01 mira una transición. Se puso a prueba el
argumento del plan con un repro propio, con **ROLLBACK**, contra la 070 instalada:

| Cadena | Esperado | Medido |
|---|---|---|
| `individual → group_class` (paso 1) con turno futuro vivo | PASA | **PASA** |
| `group_class → individual` (paso 2, encadenado sobre el mismo servicio) | RECHAZO | **RECHAZO** `P0001 / service_mode_has_future_appointments` |
| `individual → simultaneous_resource` (paso 1) | PASA | **PASA** |
| `simultaneous_resource → group_class` (paso 2, encadenado) | RECHAZO | **RECHAZO** `P0001 / service_mode_has_future_appointments` |
| `group_class → individual` con `capacity_mode` **y** `capacity` en el MISMO statement | RECHAZO | **RECHAZO** |
| `UPDATE … WHERE id IN (grupal, simultáneo)` — multi-fila hacia `individual` | RECHAZO | **RECHAZO** (trigger `FOR EACH ROW`) |

El argumento del plan se sostiene y ahora está **medido**: el guard nuevo lee **solo `OLD`**, y para
llegar a una dirección peligrosa hay que **estar** en grupal/simultáneo, momento en el que el `EXISTS`
vuelve a evaluar el **estado final de la tabla**. El estado final del repro lo confirma: de los cinco
servicios sembrados, los únicos que terminaron en un modo distinto son los que salieron de
`individual`.

⚠ **Salvedad honesta:** sí existe una cadena que esquiva el gate, pero **no** por `capacity_mode` —
por `business_id`. Está en §3.2 (`X-16-B`), es **pre-existente** (el filtro es byte-idéntico al de la
065/068) y no reabre la condición registrada de T-16-10.

### 2.2 Foco 2 — T-16-02 / T-16-15: R-1 por dirección → **cerrado en las cuatro peligrosas**

Ver la tabla de §2.1. Las cuatro direcciones peligrosas rechazan **con su código de dominio**, medido
contra la base, no leído del SQL. Y la razón por la que la dirección segura es segura quedó medida en
dos puntas: el turno preexistente sigue con `is_group = false` **después** del cambio, y el count de
cupo de `book_slot_atomic` **no** filtra por `is_group`, así que esa fila también se cuenta contra el
cupo nuevo.

### 2.3 Foco 3 — T-16-06: el filtro por tenant dentro de `SECURITY DEFINER` → **presente en los dos cuerpos INSTALADOS**

```
services_block_mode_change | prosecdef=t | {search_path=public} | v_now_time=t | predicado viejo ausente=t
services_block_delete      | prosecdef=t | {search_path=public} | v_now_time=t | predicado viejo ausente=t
```

y en los dos cuerpos, textual:
`AND (OLD."business_id" IS NULL OR a."business_id" = OLD."business_id")`.

La rama `IS NULL` es **fail-closed** (sin negocio, cuenta todo). Los dos triggers siguen enganchados
a sus funciones (`services_block_delete_trg` → BEFORE DELETE ROW; `services_block_mode_change_trg` →
BEFORE UPDATE OF `capacity_mode` ROW), verificado sobre `pg_trigger`.

### 2.4 Foco 4 — T-16-05 (`accept`): la premisa es **falsa** → 🛑 **OPEN**

El register acepta el riesgo con este argumento textual: *"ninguna superficie **anónima** puede crear
turnos en el pasado (el booking público sí respeta la ventana)"*, y registra la condición de
reapertura: *"**Reabrir si** alguna superficie no autenticada pudiera crear turnos con fecha/hora
pasada"*.

**Medido contra el Postgres local, con `SET LOCAL ROLE anon` (que es exactamente lo que hace PostgREST
con un JWT anónimo):**

| Intento como rol `anon` | Resultado |
|---|---|
| `book_slot_atomic(...)` con `p_date = hoy − 30 días` | **CREÓ EL TURNO** |
| `book_slot_atomic(...)` con `p_date = hoy`, `p_time = 00:00` (hora ya pasada) | **CREÓ EL TURNO** |
| `INSERT` directo en `appointments` (control de RLS) | RECHAZO `42501 / new row violates row-level security policy` |

O sea: la RLS **sí** cierra la escritura directa, pero la función `SECURITY DEFINER` la abre. El
backstop de ventana de reserva (`BOOK-WINDOW-03`, la capa que el propio código llama *"de AUTORIDAD"*)
vive **solo** en el route handler (`app/api/booking/create/route.ts:92`, `isDateOutOfWindow`), y el
RPC está `GRANT EXECUTE … TO "anon"` desde la migración 041 y re-otorgado en 042/058/062/063/064/068/069.
`supabase/config.toml` expone el schema `public` por REST, y `public_services` publica `id` y
`business_id` — o sea que los dos únicos parámetros no adivinables están disponibles públicamente.

**Consecuencia para esta fase:** la disposición `accept` de T-16-05 no puede sostenerse tal como está
escrita, ni en el PLAN ni en el **header de la propia migración 070**, que repite la afirmación falsa.
No es un defecto del predicado de la 070 —el código de la fase es correcto—, es una **premisa de
aceptación falsificada**. Queda **OPEN** y escalada (§6).

### 2.5 Foco 5 — T-16-08: salida nula del trigger → **imposible en los cuerpos instalados**

Cero `RETURN NULL` en `prosrc` de las dos funciones (contado sobre el cuerpo con comentarios
removidos). Los únicos caminos de salida son `RETURN NEW` / `RETURN OLD` y el `RAISE`. Y hay una
verificación por comportamiento, no solo por forma: los casos que **pasan** releen la fila
(`modeOf` / `serviceExists`), así que un 204 silencioso sin escritura saldría en rojo.

---

## 3. Lo no modelado (fuera de register) — 2 hallazgos, ambos PRE-EXISTENTES

> Estos **no** son regresiones de la Phase 16. Se reportan porque aparecieron al atacar el register y
> porque uno de ellos falsifica una disposición declarada.

### 3.1 `X-16-A` — El RPC `book_slot_atomic` es ejecutable por `anon` y no valida la ventana de reserva · **WARNING**

- **Qué es.** `GRANT EXECUTE ON FUNCTION book_slot_atomic(...) TO "anon"` (migr. 041:183, re-otorgado
  hasta la 069:489) + schema `public` expuesto por PostgREST ⇒ cualquiera con la anon key pública
  puede hacer `POST /rest/v1/rpc/book_slot_atomic` y crear un turno **sin pasar por
  `/api/booking/create`**. Eso saltea, todas juntas: la **ventana de reserva** (`isDateOutOfWindow`),
  el **gate de plan** (`plan_status` en `['expired','cancelled','suspended']`) y **reCAPTCHA**.
- **Medido.** Ver la tabla de §2.4. Dos turnos creados por el rol `anon`, uno con fecha 30 días en el
  pasado.
- **Qué NO es.** No es un agujero **cross-tenant**: la función re-impone el filtro por `business_id`
  al resolver el servicio, así que un `p_service_id` de otro negocio no resuelve a nada. La auditoría
  de la Phase 02 (`T-02-04`) evaluó exactamente ese eje y por eso lo cerró; el eje que quedó sin
  evaluar es el de **controles de aplicación que viven solo en el route handler**.
- **Antigüedad.** Pre-existente desde la 041. La Phase 16 no lo introduce ni lo agrava.
- **Por qué importa acá.** Es la razón por la que **T-16-05 queda OPEN**: su aceptación se apoya
  literalmente en que esta superficie no existe.
- **Acción sugerida (NO ejecutada por esta auditoría):** todo propio + fase propia. Opciones a evaluar
  ahí, no acá: mover el backstop de ventana **adentro** del RPC (fail-closed en la base, que es donde
  ya viven los demás invariantes del motor), o revocar el `EXECUTE` a `anon` y dejar el RPC solo para
  `service_role` (el route handler ya usa service-role). La segunda es la que alinea la superficie con
  el patrón del repo; la primera es la que no rompe nada si algún cliente llama el RPC directo.

### 3.2 `X-16-B` — El filtro por tenant del gate se esquiva moviendo `services.business_id` · **WARNING**

- **Qué es.** El predicado de los dos gates se ancla en `OLD."business_id"`. Si la fila de `services`
  cambia de negocio **antes** del cambio de modo, el `EXISTS` busca turnos del negocio **nuevo** y no
  encuentra los del viejo ⇒ el gate abre.
- **Medido** (repro propio, con ROLLBACK): servicio `group_class` con un turno futuro vivo →
  `UPDATE services SET business_id = <otro negocio>` (pasa) → `UPDATE … capacity_mode='individual'`
  ⇒ **PASA**. Es R-1 reabierto por una cadena de dos escrituras que **no** pasa por `individual`.
- **Alcance real.** La policy de `services` es `FOR ALL USING (business_id IN (select id from
  businesses where owner_id = auth.uid()))` **sin `WITH CHECK` explícito** ⇒ el `WITH CHECK` implícito
  es el mismo `USING`, así que mover la fila exige que el usuario sea dueño de **los dos** negocios. Y
  la policy de `businesses` es `USING (owner_id = auth.uid())`, también sin `WITH CHECK` explícito, así
  que un dueño **puede** crearse un segundo negocio. O sea: alcanzable, pero **confinado a tenants del
  propio usuario** — es autolesión, no cross-tenant.
- **Antigüedad.** Pre-existente: el filtro es **byte-idéntico** al de la 065 (`:254`) y la 068
  (`:271`). La cadena funcionaba igual antes de la 070.
- **Acción sugerida (NO ejecutada):** todo propio. La mitigación barata es no permitir mover
  `services.business_id` (guard o `WITH CHECK` explícito), no tocar los gates.

---

## 4. Log de riesgos aceptados

| ID | Categoría | Riesgo | Por qué se acepta | Condición de reapertura | Estado |
|---|---|---|---|---|---|
| T-16-18 | Information Disclosure | datos de prueba en la base local | Fixtures con prefijo `__test_`, `teardownOneTenant` borra el negocio entero por cascada y el usuario auth explícito en el `finally`. Corren contra el Supabase **local**, nunca contra prod; sin creds la suite se skipea y eso **no** cuenta como verde. | Reabrir si alguna suite apunta a un Supabase remoto o si el teardown deja de correr en `finally`. | **ACEPTADO** |
| T-16-05 | Tampering | GATE-03 es permisivo y el alta manual está exenta de la ventana ⇒ se pueden crear turnos en el pasado | — | *"Reabrir si alguna superficie no autenticada pudiera crear turnos con fecha/hora pasada"* | 🛑 **REABIERTO** — la condición **se cumple** (§2.4). El riesgo ya no es "autolesión del propio dueño": un tercero anónimo puede plantar filas detrás del corte nuevo de GATE-03. |

---

## 5. Threat Flags de los SUMMARY

Los dos SUMMARY declaran `## Threat Flags: Ninguno`, y esta auditoría lo verifica en vez de creerlo:

- `git diff --name-only 06229f1..HEAD` → **cero** archivos de `app/`, cero `.tsx`, cero
  `package.json` / `package-lock.json`. No hay endpoints nuevos, ni rutas de auth, ni accesos a
  archivos, ni columnas/vistas/policies nuevas.
- Los dos códigos de dominio existentes **no** se renombran y **no** se agrega ninguno nuevo
  (verificado sobre los cuerpos instalados) ⇒ no hay superficie nueva de mensajes hacia el navegador.
- El `.sql` desechable del A/B de 16-02 se creó fuera del repo y no quedó en `git status` (verificado:
  `supabase/migrations/` solo suma la 070).

**`unregistered_flags: 2`** — pero los dos (`X-16-A`, `X-16-B`) son superficie **pre-existente**
encontrada al atacar el register, no superficie **nueva** aparecida durante la implementación. No
bloquean.

---

## 6. Gaps escalados

| # | Ítem | Severidad | A quién va | Acción |
|---|---|---|---|---|
| 1 | **T-16-05 OPEN.** Su premisa (`ninguna superficie anónima puede crear turnos en el pasado`) es falsa, y la afirmación está repetida en el **header de la migración 070** (bloque "⚠ ES UN CAMBIO PERMISIVO"). Un comentario de seguridad que miente es peor que ninguno — es la misma lógica con la que T-16-11 corrigió los dos comentarios de `lib/`. | **ALTA** para la exactitud del register; **MEDIA** para el impacto real (los turnos plantados caen en horarios **pasados**) | Orquestador / dueño | (a) Re-dispositionar T-16-05 con la premisa corregida, o (b) cerrar `X-16-A` primero y recién ahí volver a aceptarlo. **Corregir el header de la 070 ANTES de aplicarla a prod**: hoy documenta como garantía algo que no lo es. Esta auditoría **no** toca archivos de implementación. |
| 2 | **`X-16-A`** — `book_slot_atomic` ejecutable por `anon` sin ventana de reserva, sin gate de plan y sin reCAPTCHA | **ALTA**, pero **pre-existente** desde la 041 y fuera del alcance de esta fase | Todo propio / fase propia | Ver §3.1. No arreglar dentro de la Phase 16: toca el motor de reservas y necesita su propio A/B. |
| 3 | **`X-16-B`** — el filtro por tenant del gate se esquiva moviendo `services.business_id` | **MEDIA**, pre-existente, confinado a tenants del propio usuario | Todo propio | Ver §3.2. |

**Ninguno de los tres es un defecto del código que la Phase 16 escribió.** La fase entrega sus tres
correcciones con las mitigaciones declaradas **presentes y medidas**.

---

## 7. Audit trail

| Verificación | Resultado |
|---|---|
| `pg_proc` de las dos funciones (secdef, `proconfig`, `v_now_time`, predicado viejo) | `t / {search_path=public} / t / t` en **las dos** |
| Filtro por tenant en los **cuerpos instalados** | presente en las **dos** |
| `RETURN NULL` en los cuerpos instalados (sin comentarios) | **0** y **0** |
| `pg_trigger` — bindings | `services_block_delete_trg` (BEFORE DELETE ROW) y `services_block_mode_change_trg` (BEFORE UPDATE OF ROW), los dos `enabled = O` |
| Repro adversarial de cadenas (6 intentos, `BEGIN … ROLLBACK`) | 1 PASA esperado + 1 PASA esperado + **4 RECHAZO** esperados; 0 sorpresas |
| `is_group` del turno preexistente tras `individual → group_class` | **false** (sigue dentro del EXCLUDE gist 013) |
| Count de cupo de `book_slot_atomic` instalado | **no** filtra por `is_group` ⇒ la fila preexistente cuenta contra el cupo nuevo |
| Repro anónimo (`SET LOCAL ROLE anon`) | **2 turnos pasados creados** vía RPC · `INSERT` directo bloqueado por RLS (`42501`) |
| Idempotencia de la 070 | aplicada **2 veces seguidas**, exit 0, `pg_proc` sigue en `t\|t` |
| `vitest run capacity-mode-change-gate + service-delete-gate` (re-corrido por esta auditoría) | **27 passed \| 1 expected fail (28)** · 0 skips |
| Criterios de grep del PLAN sobre la 070, `schema.sql`, los dos tests, el fixture y el runbook | **todos** cumplidos (medidos, tabla en §1) |
| `git diff --name-only 06229f1..HEAD` | sin `app/`, sin `package*.json`; de `lib/` solo los dos declarados y con **0** líneas de código |
| Queries contra producción | **cero**. La 070 sigue **sin aplicar** en prod (D-08) |

**Archivos de implementación modificados por esta auditoría: ninguno.**
