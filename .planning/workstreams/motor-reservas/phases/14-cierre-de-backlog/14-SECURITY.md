---
phase: 14-cierre-de-backlog
workstream: motor-reservas
secured: 2026-08-06T00:00:00Z
status: secured
asvs_level: 1
block_on: high
register_authored_at_plan_time: true
threats_total: 30
threats_closed: 30
threats_open: 0
threats_mitigate: 23
threats_accept: 7
threats_transfer: 0
unregistered_flags: 0
commit_range: dcf970f..HEAD
---

# Phase 14 — Cierre de backlog · Auditoría de seguridad

**Veredicto: SECURED — 30/30 amenazas cerradas (23 `mitigate` verificadas contra el código, 7 `accept` registradas abajo). Cero amenazas abiertas, cero flags sin registrar.**

Postura del audit: cada mitigación se dio por ausente hasta encontrar la línea que la implementa. Las 23
`mitigate` se verificaron leyendo el archivo citado y confirmando `archivo:línea`, no la narrativa del
SUMMARY. Las suites que las mitigaciones citan como prueba se corrieron de verdad:

```
npx vitest run test/abono-delete-gate.test.ts test/abono-cancel-link.test.ts test/client-status.test.ts
→ Test Files 3 passed (3) · Tests 24 passed (24)
```

---

## 1. Registro de amenazas — verificación

### Plan 14-01 — Pulido de botones + RiskBadge

| ID | Categoría | Disp. | Estado | Evidencia |
|----|-----------|-------|--------|-----------|
| T-14-01 | Information Disclosure | accept | CLOSED | Riesgo aceptado §2. Confirmado igual en código: `components/crm/risk-badge.tsx:44-48` (`RISK_LABEL` = enum cerrado de 3 literales) y `:63` (único hijo de texto del `<span>`). No se agrega ningún campo de negocio al DOM. |
| T-14-02 | Tampering | mitigate | **CLOSED** | `git log --oneline dcf970f..HEAD -- components/ui/card.tsx` → **0 commits**; `git diff --stat dcf970f..HEAD -- components/ui/card.tsx` → **vacío**. El componente transversal quedó fuera del diff de las tres tareas, como exigía el criterio. Los fixes viven en el call-site: `app/(dashboard)/settings/settings-client.tsx:1443,1565,2147,2156,2204,2264,2307,2341,2374` (`self-start`), con el porqué documentado en `:2146`. |
| T-14-03 | Denial of Service | accept | CLOSED | Riesgo aceptado §2. El backstop declarado (UAT visual bloqueante de 14-07) **existió y funcionó**: encontró la regresión de POLISH-05 (`14-07-SUMMARY.md` punto 2.3 → `14-VERIFICATION.md` gap 1). |

### Plan 14-02 — Clasificación de clientes

| ID | Categoría | Disp. | Estado | Evidencia |
|----|-----------|-------|--------|-----------|
| T-14-04 | Information Disclosure | mitigate | **CLOSED** | `lib/client-status.ts:36` — firma exacta `classifyClient({ visits, daysSinceLast }: { visits: number; daysSinceLast: number })`: dos números, nada más. Criterio verificado por grep sobre el archivo: **0** líneas `^import` / `require(`; **0** apariciones de `created_at`, `business_id` o `supabase` en código (la única mención de `business_id` es el comentario `:8`). Call-site alineado: `app/(dashboard)/clients/clients-client.tsx:426` pasa solo los dos números. |
| T-14-05 | Tampering | accept | CLOSED | Riesgo aceptado §2. Confirmado: `clients-client.tsx:426-428` usa el resultado para tab/badge/sugerencia (`:198`), no para gatear ninguna acción ni permiso. |
| T-14-06 | Repudiation | accept | CLOSED | Riesgo aceptado §2. Registrado en `14-02-SUMMARY.md:12,59,79,104` (efecto de D-11 explicitado: 46-60 días salen del tab "Pausa"). Umbral único en `lib/client-status.ts:21` (`PAUSED_AFTER_DAYS = 60`), con test de borde en `test/client-status.test.ts:54,58`. |

### Plan 14-03 — Endpoint `GET /api/abonos/cancel-link/[id]`

| ID | Categoría | Disp. | Estado | Evidencia |
|----|-----------|-------|--------|-----------|
| T-14-07 | Information Disclosure | mitigate | **CLOSED** | `app/api/abonos/cancel-link/[id]/route.ts:71-78` — el filtro `.neq('status', 'cancelled')` (`:76`) viaja **dentro** de la query, ya scopeada por `.eq('id', …)` (`:74`) y `.eq('business_id', business.id)` (`:75`). No hay `if` sobre la fila leída: `status` ni siquiera se selecciona (`:73` = una sola columna). Caso 3 de la suite verde: `test/abono-cancel-link.test.ts:174-184` (404 + aserción de que el token no aparece en el cuerpo). Cobertura de TODAS las superficies del dueño: `grep -rn "cancel_token" app/ lib/ components/` → ninguna ruta del panel ni `app/(dashboard)/abonos/**` entrega el token; el único otro select del token para una serie es `app/api/abonos/create/route.ts:197`, que es el alta (serie recién nacida, `active`). |
| T-14-08 | Information Disclosure | mitigate | **CLOSED** | Cuatro caminos de rechazo devuelven el **mismo literal**: `route.ts:49`, `:64`, `:78`, `:85` → `{ ok: false, error: 'not_found' }` + 404. Cero códigos de error nuevos (el único código distinto del handler es el 401 de `:56`). Aserción **cruzada** implementada: `test/abono-cancel-link.test.ts:199-210` compara `resCancelada.status === resAjena.status` y `bodyCancelada` ≡ `bodyAjena` — cuerpo contra cuerpo, no contra un literal. Corroborado en navegador (14-07, punto 8): id cancelado e id inventado → `{"ok":false,"error":"not_found"}` idéntico. |
| T-14-09 | Elevation of Privilege | mitigate | **CLOSED** | `route.ts:1` importa `createClient` de `@/lib/supabase/server` (anon + cookies + RLS); `:52-56` exige sesión; `:59-64` resuelve el tenant por `.eq('owner_id', user.id)`, nunca por un dato de la request. Service-role prohibido: `grep -n "createAdminClient\|SERVICE_ROLE"` sobre el archivo → **0 matches**. |
| T-14-10 | Spoofing | accept | CLOSED | Riesgo aceptado §2. Confirmado en código: `app/(dashboard)/abonos/abonos-client.tsx:549` envuelve el bloque de copiar en `a.status !== 'cancelled'`, y el comentario `:540-547` declara explícitamente que es cortesía y que la autoridad es el endpoint. |
| T-14-11 | Repudiation | mitigate | **CLOSED** | El corte es **solo** sobre `'cancelled'`: `route.ts:76` (`.neq('status','cancelled')`), no un allow-list de estados. Caso 2 verde: `test/abono-cancel-link.test.ts:163-172` — una serie `completed` devuelve 200 con su URL. |

### Plan 14-04 — Migración 066 (gate `BEFORE DELETE`)

| ID | Categoría | Disp. | Estado | Evidencia |
|----|-----------|-------|--------|-----------|
| T-14-12 | Tampering | mitigate | **CLOSED** | `supabase/migrations/066_abono_delete_gate.sql:96-98` — `CREATE TRIGGER abonos_block_delete_trg BEFORE DELETE ON public.abonos FOR EACH ROW`. Corre dentro de la transacción del DELETE (D-18). Caso 1 borra por PostgREST sin React de por medio: `test/abono-delete-gate.test.ts:125-138` (asierta `code = 'P0001'` **y** `message contains 'abono_is_active'`, y que la fila sigue existiendo). |
| T-14-13 | Elevation of Privilege | mitigate | **CLOSED** | `066:41-42` (`SECURITY DEFINER SET search_path = public`). Criterio verificado por grep sobre el archivo: el **único** `SELECT` es `066:57` — `NOT EXISTS (SELECT 1 FROM businesses b WHERE b."id" = OLD."business_id")`, un predicado de existencia por PK contra la propia columna de la fila borrada, que no devuelve ni una columna del negocio. **Cero** `DELETE` / `UPDATE` / `INSERT` en el cuerpo. |
| T-14-14 | Information Disclosure | mitigate | **CLOSED** | `066:79` — `RAISE EXCEPTION 'abono_is_active' USING ERRCODE = 'P0001'`. Literal fijo: sin nombres, sin fechas, sin conteos, sin interpolación (`%`) de ninguna clase. Espejo idéntico en `supabase/schema.sql:78`. |
| T-14-15 | Denial of Service | mitigate | **CLOSED** | Guard de cascada presente: `066:56-59` (`IF OLD.business_id IS NOT NULL AND NOT EXISTS (…) THEN RETURN OLD`). Caso 5 verde: `test/abono-delete-gate.test.ts:201-224` — con una serie `active`, el DELETE de la serie sigue rechazado (`P0001`) pero el `DELETE FROM businesses` pasa y la serie desaparece por cascada. El helper de cleanup nuevo (`test/helpers/booking-fixtures.ts:272-284`, `purgeAbonos`) archiva antes de borrar y está enganchado en `abono-create`, `abono-cron`, `canchas-delete-integration` y `service-snapshot`. |
| T-14-16 | Tampering | mitigate | **CLOSED** | Criterio literal verificado: `grep -in "return null" supabase/migrations/066_abono_delete_gate.sql` → **0 matches**. Único retorno = `066:86` (`RETURN OLD`), con el porqué en `:82-85`. Caso 2 verde: `test/abono-delete-gate.test.ts:140-149` asierta `error === null`, `data.length === 1` **y** `abonoExists === false` (desaparición real). Cerrado además end-to-end en navegador (14-07, punto 13): estado cambiado a `active` por SQL con el modal abierto → el modal no cerró y salió el toast propio. |
| T-14-17 | Information Disclosure | mitigate | **CLOSED** | Policies de la 054 intactas: `git diff --stat dcf970f..HEAD -- supabase/migrations/054_abonos.sql` → **vacío**. Caso 6 con sesión anon real de otro dueño: `test/abono-delete-gate.test.ts:226-237` (0 filas, sin error, la fila sobrevive). Contrapeso anti-falso-verde presente — caso 7 `:239-246` (el propio dueño sí borra, 1 fila) — más dos guards de arranque en `:44-54`: aborta si el cliente de aserción quedó sin sesión o si la anon key es en realidad la service-role. |
| T-14-18 | Tampering | mitigate | **CLOSED** | `grep -rn "db push"` sobre el phase dir: las 12 apariciones son **prohibiciones y declaraciones de cumplimiento**, ninguna una ejecución (`14-04-PLAN.md:104,227,246`, `14-04-SUMMARY.md:127,297,326`, `14-07-PLAN.md:305,326`, `14-07-SUMMARY.md:172,253,259`). Apply manual con checkpoint humano bloqueante en 14-07 (§2 abajo), confirmado por el orquestador contra la base de prod. |

### Plan 14-05 — Píldoras compartidas

| ID | Categoría | Disp. | Estado | Evidencia |
|----|-----------|-------|--------|-----------|
| T-14-19 | Information Disclosure | mitigate | **CLOSED** | Criterio de grep sobre imports cumplido: `components/dashboard/active-tabs.tsx:23-25` son los **únicos tres** imports del archivo — `react`, `type { LucideIcon }` y `@/lib/utils`. Cero tipos de dominio, cero clientes de datos. Genérico sobre `T` (`:56`, `:37`); el predicado de "activo" se queda en el call-site (`settings-client.tsx:872`, `canchas-manager.tsx:66`). |
| T-14-20 | Tampering | mitigate | **CLOSED** | Copy **verbatim** en el diff de `settings-client.tsx`: los cuatro strings del estado vacío se mueven sin cambiar un carácter ("Todavía no tenés servicios activos", "Agregá el primero acá abajo…", "No hay servicios desactivados", "Acá van a aparecer los que dejes de ofrecer…"). Clases de las píldoras idénticas (`px-2.5 py-1 rounded-full text-xs font-medium transition-colors` + `bg-primary text-primary-foreground` / `bg-secondary/50 …`), ahora en `active-tabs.tsx:90-93`. El trabajo de 14-01 en el mismo archivo sobrevive: `grep -c "self-start" settings-client.tsx` → **10** (9 del inventario de 14-01 + el de `:1443`). Invariante filtro≡contador preservado en un solo predicado (`active-tabs.tsx:59-67`). |
| T-14-21 | Denial of Service | accept | CLOSED | Riesgo aceptado §2. El diff de `components/dashboard/canchas-manager.tsx` en el rango de la fase no introduce **ninguna** línea con `supabase`, `select(`, `fetch(`, `delete(`, `insert` ni `update`: es filtro de presentación puro. |

### Plan 14-06 — UI del borrado

| ID | Categoría | Disp. | Estado | Evidencia |
|----|-----------|-------|--------|-----------|
| T-14-22 | Elevation of Privilege | mitigate | **CLOSED** | `app/(dashboard)/abonos/abonos-client.tsx:13` importa `createClient` de `@/lib/supabase/client` (browser, anon + RLS), instanciado en `:141`. El DELETE lleva filtro explícito por el negocio del componente: `:254` — `.delete().eq('id', id).eq('business_id', business.id)`. Service-role prohibido, criterio de grep: `grep -n "createAdminClient\|SERVICE_ROLE"` sobre el archivo → **0 matches**. |
| T-14-23 | Tampering | mitigate | **CLOSED** | `:254` pide de vuelta las filas afectadas (`.select('id')`) y `:261-262` trata 0 filas sin error como **fallo** (`return { ok: false, error: 'unknown' }`), antes de cualquier `toast.success` (`:263`). Probado por el caso 6 del gate (`test/abono-delete-gate.test.ts:233-236`: 0 filas ⇒ la fila sigue viva). |
| T-14-24 | Tampering | mitigate | **CLOSED** | La autoridad es el trigger de la 066, que corre dentro de la misma transacción del DELETE (`066:96-98`) — no hay ventana TOCTOU contra el pre-check de `:489-490`. El rechazo tardío se propaga: `:686-697`, `onConfirm` hace `throw new Error(res.error)` cuando `!res.ok`, que es lo que mantiene el modal abierto. Verificado en navegador (14-07, punto 13). |
| T-14-25 | Information Disclosure | mitigate | **CLOSED** | `:676-685` — `onConfirmError` traduce a un conjunto **cerrado** de dos mensajes propios. El motivo que llega es siempre uno de los dos literales de la unión discriminada (`:57` `DeleteAbonoResult`, valores `'is_active' \| 'unknown'`), producidos en `:258-262`. El texto crudo del error de Postgres nunca se interpola: solo se lo inspecciona en `:258` (`error.code`, `error.message.includes(...)`). |
| T-14-26 | Denial of Service | mitigate | **CLOSED** | Doble candado en el código: `:489` `const gateRechaza = a.status === 'active'` y `:490` `const esArchivado = !isAbonoActivo(a, futureTurnoCounts) && !gateRechaza`, que es lo único que monta el botón (`:590`). Segundo candado en la base: `066:78-79`. Casos 9 y 10 de la UAT (serie activa no ofrece "Eliminar"; archivada sí y borra). |
| T-14-27 | Repudiation | mitigate | **CLOSED** | `supabase/schema.sql:1573` — `appointments_abono_id_fkey … ON DELETE SET NULL` (de la 054, no tocada en la fase). Caso 4 verde: `test/abono-delete-gate.test.ts:166-199` — tras borrar la serie, los dos turnos existen con `abono_id = null`, `service_name` no nulo, `service_price = 100`, y el futuro conserva su estado `confirmed`. Corroborado en la UAT (punto 11: turnos vivos en Finanzas y en la ficha del cliente). |

### Plan 14-07 — UAT + apply

| ID | Categoría | Disp. | Estado | Evidencia |
|----|-----------|-------|--------|-----------|
| T-14-28 | Tampering | mitigate | **CLOSED** | Migración 066 aplicada a mano a producción el **2026-08-06**, cero `db push` (ver T-14-18). Verificación posterior **contra la base real**, no contra el runbook: trigger `abonos_block_delete_trg` con `tgenabled = 'O'`, y dentro de una transacción abortada el borrado de una serie forzada a `active` devolvió `ERROR: P0001: abono_is_active` / `CONTEXT: PL/pgSQL function abonos_block_delete() line 38 at RAISE`. Orden del runbook respetado: la base quedó **adelante** del código (`14-07-SUMMARY.md:172-186`). Nota de rigor: la primera prueba se declaró INCONCLUSA (un DELETE que no matchea filas no corre el trigger) y se rehízo forzando la fila. |
| T-14-29 | Repudiation | mitigate | **CLOSED** | Checkpoints **no** auto-aprobados: `14-07-SUMMARY.md` transcribe **23 observaciones** numeradas (10 visuales + 13 funcionales) con lo visto en pantalla, y la Task 2 se cierra **CON 1 FALLA**, no como aprobación limpia. Incluye la anulación de dos corridas contaminadas/inconclusas (puntos 13 y Task 4 (b)). `workflow.auto_advance` resuelve a `true` en el config raíz y fue anulado deliberadamente para esta fase. |
| T-14-30 | Information Disclosure | accept | CLOSED | Riesgo aceptado §2. Sembrado contra el Supabase **local** sobre el negocio de prueba de `seed.sql`; la única mutación de entorno fue `is_admin = true` en local, con producción declarada intacta (`14-07-SUMMARY.md`, Deviations §1). |

---

## 2. Log de riesgos aceptados

| ID | Categoría | Superficie | Justificación registrada | Quién decide si se reabre |
|----|-----------|------------|--------------------------|---------------------------|
| T-14-01 | Information Disclosure | `components/crm/risk-badge.tsx` | El badge renderiza un literal de un enum de 3 valores (`RISK_LABEL`) que ya se mostraba antes; el cambio de la fase es de color. No se agrega ningún dato del negocio al DOM. | Reabrir si el badge pasa a renderizar contenido dinámico (nombre, monto, motivo). |
| T-14-03 | Denial of Service | superficie visual | Un `className` incorrecto degrada la lectura, no la disponibilidad. Backstop declarado = la UAT visual bloqueante de 14-07, que efectivamente encontró la regresión de POLISH-05. | Reabrir solo si un cambio de clases pudiera bloquear una acción (no fue el caso). |
| T-14-05 | Tampering | clasificación en el cliente | Presentación derivada de datos que el dueño ya ve en la misma pantalla; no gatea acción ni permiso (`clients-client.tsx:426-428`). | Reabrir si `status` pasa a gatear una acción (descuento, envío, permiso). |
| T-14-06 | Repudiation | umbral unificado en 60 días (D-11) | Cambio de criterio de negocio aceptado en el CONTEXT y registrado en `14-02-SUMMARY.md` con su efecto explícito (46-60 días salen de "Pausa"). No se midió el impacto sobre datos reales: el negocio local no tiene antigüedad suficiente. | El dueño, si el tab "Pausa" queda vacío de más en prod. |
| T-14-10 | Spoofing | UI del detalle del abono | Ocultar el bloque de copiar es cortesía, no control: quien fuerce la request choca contra el gate del endpoint (T-14-07/08, verificado). | No aplica: la autoridad está en el server. |
| T-14-21 | Denial of Service | filtro por tab en Canchas | Un filtro mal puesto oculta filas de la propia pantalla del dueño; no borra datos ni afecta reservas. Diff sin superficie de datos nueva. | Reabrir si el filtro pasa a alimentar una escritura. |
| T-14-30 | Information Disclosure | datos sembrados para la UAT | Sembrado contra el Supabase **local**, sobre el negocio de prueba de `seed.sql`. Ningún dato real de cliente tocado. La única escritura en prod de toda la fase fue el DDL de la 066 (y una transacción de verificación revertida). | Reabrir si una UAT futura necesita datos de prod. |

---

## 3. Threat Flags de los SUMMARY

| Origen | Flag | Mapeo |
|--------|------|-------|
| `14-06-SUMMARY.md:213-217` | "Ninguna superficie de seguridad nueva fuera del `<threat_model>`: no hay endpoint nuevo, ni migración, ni cambio de policy. La única escritura nueva es un DELETE autenticado del dueño sobre su propia tabla." | Declaración de ausencia. Verificada de forma independiente: el DELETE está cubierto por T-14-22..27 y por la RLS de la 054 + el gate de la 066. |

**Unregistered flags: 0.** Barrido independiente sobre los 4 archivos del rango que **no** tienen amenaza propia
(`clients-client.tsx`, `canchas-manager.tsx`, `agenda-client.tsx`, `nuevo-{turno,abono}-form.tsx`): el diff
`dcf970f..HEAD` no agrega ni una línea con `supabase`, `select(`, `from(`, `fetch(`, `delete(`, `insert`,
`update`, `token`, `email` ni `phone`. No apareció superficie de ataque nueva sin mapear.

**Observación de proceso (no bloqueante):** 6 de los 7 SUMMARY no traen sección `## Threat Flags`
explícita (solo `14-06`). No hay gap real — el barrido de arriba lo cubre — pero conviene que la sección
sea obligatoria aunque diga "ninguna", para que la ausencia no se confunda con un olvido.

---

## 4. Gaps escalados

**Ninguno de seguridad.** Los tres gaps abiertos de la fase (`14-VERIFICATION.md`, destino plan 14-08) son
visuales y no tocan ninguna amenaza del registro:

1. **POLISH-05 — "Alto" ≡ "Medio" dentro de los modales del CRM** (`DialogPortal` monta fuera de
   `.crm-shell`). Regresión de 14-01, **visual**. Roza T-14-01/T-14-03 solo por vecindad: no expone ningún
   dato (el badge sigue siendo un literal de 3 valores) y no afecta disponibilidad. El backstop de T-14-03
   es precisamente lo que lo detectó.
2. Toggle de preselección en `Equipo` a ancho completo — cobertura de POLISH-04, sin impacto de seguridad.
3. Centrado vertical de los "+ Agregar" de `Equipo` — ídem.

**Nota operativa levantada por la fase, para el próximo apply manual:** producción **no tiene libro de
migraciones** (`supabase_migrations.schema_migrations` no existe → `42P01`). El pre-check (a) del runbook de
14-04 no es ejecutable tal cual contra este proyecto; el "última aplicada = NNN" se lleva por documentación.
Conviene corregir el runbook antes de la 067.

---

## 5. Audit trail

| Ítem | Valor |
|------|-------|
| Rango auditado | `dcf970f..HEAD` (28 commits) |
| Archivos de implementación modificados por este audit | **0** (audit read-only; único archivo escrito: este `14-SECURITY.md`) |
| Migración auditada | `supabase/migrations/066_abono_delete_gate.sql` (101 líneas) + espejo `supabase/schema.sql:62-85,1479` |
| Estado en producción | 066 aplicada 2026-08-06 · trigger `tgenabled='O'` · rechazo `P0001/abono_is_active` verificado en vivo · cero `db push` |
| Suites de la fase (corridas por el auditor) | `abono-delete-gate` + `abono-cancel-link` + `client-status` → **24/24 pasan** |
| Estado global del pipeline (orquestador) | `./node_modules/.bin/tsc --noEmit` exit 0 · `npm run build` exit 0 · `npx vitest run` 887 tests / 875 pasan |
| Flakiness conocida | `test/abono-{create,cron,generation}.test.ts` — pre-existente, conjunto variable por corrida, verde en aislado, idéntica con y sin el trigger de la 066. Documentada en el baseline antes de la primera línea de código de la fase. No investigada por instrucción explícita. |
| Fuentes verificadas | 7 PLAN + 7 SUMMARY + `14-VERIFICATION.md` + `14-CONTEXT.md` (D-01..D-19) |
| ASVS | Nivel 1 · `block_on: high` · sin hallazgos HIGH |

---

*Phase: 14-cierre-de-backlog · Workstream: motor-reservas · Secured: 2026-08-06*
