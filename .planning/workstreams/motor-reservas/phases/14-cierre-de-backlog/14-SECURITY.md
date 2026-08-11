---
phase: 14-cierre-de-backlog
workstream: motor-reservas
secured: 2026-08-11T00:00:00Z
status: secured
blocking: false
asvs_level: 1
block_on: high
register_authored_at_plan_time: true
threats_total: 42
threats_closed: 42
threats_open: 0
threats_mitigate: 32
threats_accept: 10
threats_transfer: 0
unregistered_flags: 0
commit_range: dcf970f..c7d4728
audit_rounds:
  - date: 2026-08-06
    scope: "planes 14-01…14-07 · T-14-01…T-14-30 · rango dcf970f..8e0b03e"
    verdict: "SECURED 30/30"
  - date: 2026-08-11
    scope: "planes 14-08 y 14-09 (cierre de gaps) · T-14-31…T-14-40 + T-14-SC + T-14-41 · rango 8e0b03e..f03f295"
    verdict: "11/11 declaradas CLOSED · 1 flag sin registrar abierto (T-14-41, WARNING, no bloqueante)"
  - date: 2026-08-11
    scope: "remediación de T-14-41 · rango f03f295..c7d4728"
    verdict: "SECURED 42/42 — T-14-41 CLOSED con las dos condiciones de cierre satisfechas"
---

# Phase 14 — Cierre de backlog · Auditoría de seguridad

**Veredicto acumulado: 42/42 amenazas cerradas (32 `mitigate` verificadas contra el código, 10 `accept` registradas abajo). `threats_open: 0`.**

Este archivo cubre **tres rondas** de auditoría:

| Ronda | Fecha | Alcance | Rango | Veredicto |
|---|---|---|---|---|
| 1 | 2026-08-06 | Planes 14-01…14-07 · T-14-01…T-14-30 | `dcf970f..8e0b03e` | SECURED 30/30 |
| 2 | 2026-08-11 | Planes **14-08 y 14-09** (cierre de gaps) · T-14-31…T-14-40 + T-14-SC + **T-14-41** | `8e0b03e..f03f295` | 11/11 declaradas CLOSED · 1 flag sin registrar **OPEN** (WARNING) |
| 3 | 2026-08-11 | Remediación de **T-14-41** | `f03f295..c7d4728` | **SECURED 42/42** — ver §7 |

**Por qué la ronda 1 no cubría esto:** el audit del 2026-08-06 corrió cuando la fase tenía 7 planes. Los
planes **14-08** y **14-09** son de *cierre de gaps* — los escribió y ejecutó `14-VERIFICATION.md`
**después** de esa auditoría (commits `950b3a4`…`3a7f4c7`, 2026-08-10) — y traen su propio
`<threat_model>` con 11 amenazas que ningún audit había tocado. La ronda 2 verifica exactamente ese
delta y **no** re-audita T-14-01…T-14-30, cuya evidencia queda intacta abajo.

## Ronda 1 (2026-08-06) — postura y método

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

### Plan 14-08 — Scope de shell para superficies portaleadas *(ronda 2, 2026-08-11)*

| ID | Categoría | Disp. | Estado | Evidencia |
|----|-----------|-------|--------|-----------|
| T-14-31 | Spoofing | mitigate | **CLOSED** *(con salvedad de evidencia, ver §6.1)* | Las dos mitades del cableado existen y se leyeron línea por línea. **(a) Consumo:** `components/ui/dialog.tsx:61` — `const shellScope = useShellScope()` dentro de `DialogContent`; `:68` — `portalScopeClass(shellScope)` como **primer** argumento del `cn()` del `DialogPrimitive.Popup` (`data-slot="dialog-content"`, `:66`), o sea sobre el popup y **no** sobre el backdrop (`DialogOverlay`, `:33-41`, queda limpio). **(b) Publicación:** `app/(crm)/layout.tsx:60` — `<ShellScopeProvider scope={CRM_SHELL_CLASS}>` envuelve el shell entero; `:61` — el wrapper usa la **misma** constante (`cn(CRM_SHELL_CLASS, …)`), así que shell y portal no pueden divergir. **(c) Fuente única:** `lib/shell-scope.ts:41` — `CRM_SHELL_CLASS = 'dark crm-shell'`. **(d) Regresión:** `test/shell-scope.test.ts:61-118` (describe de cableado, 6 aserciones por lectura de fuentes) — corrido por el auditor: `npx vitest run components/crm/confirm-dialog.test.tsx test/shell-scope.test.ts` → **26 passed (26)**. **(e) Prueba de mutación transcrita:** `14-08-SUMMARY.md:119-145` — test que cae (`el scope se aplica sobre el POPUP, no sobre el backdrop`), mensaje literal (`AssertionError: expected -1 to be greater than 2485`) y restauración verificada. **(f) Arbitraje humano:** `14-09-SUMMARY.md:121-122`, punto 1 de la UAT. |
| T-14-32 | Spoofing | mitigate | **CLOSED** | Contexto opt-in con default vacío: `components/ui/shell-scope.tsx:27` — `React.createContext<string>("")`, privado (no se exporta; `:50` exporta solo `ShellScopeProvider` y `useShellScope`). `lib/shell-scope.ts:51-54` devuelve `undefined` para `undefined`, `''` y solo-espacios, probado en `test/shell-scope.test.ts:37,41,45`. Inventario anti-fuga **re-ejecutado por el auditor**: `grep -rln "ShellScopeProvider" app components` → exactamente **2 archivos** (`app/(crm)/layout.tsx`, `components/ui/shell-scope.tsx`). Afirmado además en test: `:112-117` verifica que `app/(dashboard)/layout.tsx` no contiene `ShellScopeProvider` ni `crm-shell`. |
| T-14-33 | Information Disclosure | accept | CLOSED | Riesgo aceptado §2. Confirmado en código: `lib/shell-scope.ts:41` es un literal estático sin interpolación de ningún dato; `portalScopeClass()` (`:51-54`) devuelve el argumento tal cual y no compone strings. Test `:20` congela el contenido exacto (`['dark','crm-shell']`) y `:26-28` prohíbe `--`, `crm-danger` y `var(`. |
| T-14-34 | Tampering | mitigate | **CLOSED** | Criterio literal re-ejecutado por el auditor sobre el rango completo del delta: `git log --oneline 8e0b03e..HEAD -- app/globals.css app/themes.css components/crm/risk-badge.tsx components/ui/{card,button,input,label}.tsx components/dashboard/active-tabs.tsx package.json package-lock.json` → **0 commits**. Los tres archivos del threat quedaron fuera del diff de las dos rondas de planes. Invariante D-07 afirmado en test: `test/shell-scope.test.ts:102-110` (el badge resuelve `var(--danger)` para `alto` y `bg-primary` para `medio`, y **no** nombra `crm-danger` ni `var(--destructive)`). |
| T-14-35 | Denial of Service | accept | CLOSED | Riesgo aceptado §2. Los dos backstops declarados existieron: `npm run build` exit **0** (`14-08-SUMMARY.md:152`, `14-09-SUMMARY.md:210`) y el checkpoint humano bloqueante de 14-09, que **encontró 3 defectos reales** en la primera ronda (puntos 3, 5 y 6) — o sea que el backstop no fue decorativo. `./node_modules/.bin/tsc --noEmit` re-ejecutado por el auditor → exit **0**. |
| T-14-SC | Tampering (supply chain) | mitigate | **CLOSED** | Re-ejecutado por el auditor sobre el delta completo: `git diff 8e0b03e..HEAD -- package.json` → **0 líneas**; `package-lock.json` sin commits en el rango. `tech-stack.added: []` en los dos SUMMARY. Cero instalaciones ⇒ no aplica el gate de legitimidad de paquetes. |

### Plan 14-09 — POLISH-04 en Equipo + UAT bloqueante + trazabilidad *(ronda 2, 2026-08-11)*

| ID | Categoría | Disp. | Estado | Evidencia |
|----|-----------|-------|--------|-----------|
| T-14-36 | Tampering | mitigate | **CLOSED** | Conteos anti-regresión **re-ejecutados por el auditor** sobre `app/(dashboard)/settings/settings-client.tsx`: `<Button … className="self-start"` → **9** (los de 14-01, intactos); `<ActiveTabs` → **2** (14-05 / EXTRA-A); `role="radiogroup"` → **2** (el de Equipo y el gemelo de `CapacityModeFields`, sin tocar); `aria-label="Preselección del profesional"` → **1** (la semántica sobrevivió a la edición del `className`). Además se verificó que el diff **no se derrama a las otras 4 vistas** del archivo compartido: `git diff -U0 8e0b03e..HEAD` da hunks solo en `ProFields` (`:70-112`), en el estado del alta de profesional (`:711`, `:795`), en el bloque de Equipo (`:1829-1832`, `:1909-1953`) y en el diálogo de edición de profesional (`:2466-2469`) — y `grep -rn "<ProFields"` devuelve exactamente **2** call-sites, los dos de Equipo. Punto 7 de la UAT confirma a ojo cero regresión de 14-01/14-05 (salvedad de transcripción en §6.1). |
| T-14-37 | Tampering | mitigate | **CLOSED** | `git log --oneline 8e0b03e..HEAD -- components/ui/card.tsx components/ui/button.tsx components/ui/input.tsx components/ui/label.tsx components/dashboard/active-tabs.tsx` → **0 commits**. El fix vive en el call-site: `settings-client.tsx:1930` (`flex w-full flex-col … sm:inline-flex sm:w-auto sm:flex-row sm:flex-wrap sm:self-start`) con el comentario de rigor en `:1912-1929` explicando por qué no se toca `Card`. **Nota:** el criterio literal del plan (`git diff --name-only` = 1 archivo) ya no se cumple —el diff del plan son 4 archivos de código— porque el checkpoint humano autorizó ampliar el alcance a los 3 archivos del CRM (ver T-14-41). El invariante que T-14-37 protege (los 5 transversales fuera del diff) **sí** se cumple. |
| T-14-38 | Spoofing | mitigate | **CLOSED** *(con salvedad de evidencia, ver §6.1)* | `14-09-SUMMARY.md:117-155` trae las **7 observaciones numeradas** transcritas más una **segunda ronda** de re-observación ("Aprobado todo. Aplica el min-h11", `:137`). La prueba fuerte de que el navegador se abrió de verdad no es la aprobación sino los **3 defectos que el pipeline verde no veía** (puntos 3, 5 y 6), cada uno con su corrección commiteada y verificable: `2e3a155` (datos de contacto siempre visibles), `515ab6d` (segmentado mobile), `0f44da8` (confirmar destructivo del panel) — más `b32c5c9`, que manda el punto 4 al backlog. Un checkpoint auto-aprobado no produce un reporte que cambia el código. |
| T-14-39 | Repudiation | mitigate | **CLOSED** | **Orden verificado en el historial, no en la narrativa:** el commit de la Task 3 (`abb7ce8`, trazabilidad) es el **último** del plan, posterior a las 3 correcciones del checkpoint (`2e3a155`, `515ab6d`, `0f44da8`) y al ajuste final (`566a7b3`) — la precondición dura se respetó. Criterios re-ejecutados por el auditor: `^- \[x\] \*\*POLISH-0[45]\*\*` → **2**; `^\| POLISH-0[4567] \| Phase 14 \| Complete` → **4** (las cuatro filas de la fase con el mismo estado); `^- \[x\] 14-0[89]-PLAN\.md` → **2**; `^- \[x\] 14-0[1-7]-PLAN\.md` → **7** (anti-clobber: las entradas previas siguen ahí y marcadas). `git diff --stat -- ROADMAP.md` → 2 inserciones / 2 borrados (Edit acotado, ≤ 20). |
| T-14-40 | Information Disclosure | accept | CLOSED *(con corrección de la justificación, ver §2)* | Riesgo aceptado §2. El guard de la vista no se tocó: `app/(dashboard)/equipo/page.tsx:8-18` (sesión → `redirect('/login')`, negocio por `owner_id`, redirección del rubro canchas antes de las queries) y las 5 queries siguen con `.eq('business_id', business.id)`. **Salvedad:** el cambio ya **no** es solo de ancho — `2e3a155` eliminó el enlace desplegable "+ Datos de contacto (opcional)" y dejó Teléfono/Email **siempre visibles** en el alta. Verificado que no agrega datos del negocio al DOM: son inputs **vacíos** del formulario de alta (`newPro` arranca en `EMPTY_PRO`), el diálogo de **edición** ya los mostraba siempre (pasaba `showExtra` sin condición), y `proToPayload` ya normalizaba los dos campos — la visibilidad nunca gateó el payload. El `accept` se sostiene; la justificación textual del register quedó desactualizada. |
| T-14-SC | Tampering (supply chain) | mitigate | **CLOSED** | Mismo criterio y misma evidencia que en 14-08: `git diff 8e0b03e..HEAD -- package.json` → 0 líneas; `package-lock.json` sin commits en el rango. |

### Cambio no modelado por ningún plan *(ronda 2, 2026-08-11)*

| ID | Categoría | Disp. | Estado | Evidencia |
|----|-----------|-------|--------|-----------|
| T-14-41 | Spoofing (señal de peligro de una acción destructiva) | mitigate | **CLOSED** *(ronda 3, §7)* | **Remediada en `79458f1`, `8a3a271`, `c7d4728`** — las dos condiciones de cierre satisfechas; detalle y contra-verificación en **§7**. Dictamen original en **§6.2**. Hallazgo: `confirmButtonClass(destructive?, shellScope?)` (`components/crm/confirm-dialog.tsx:210-214`) saca el rojo de peligro de los **5** `ConfirmDialog` del panel del dueño, todos `risk="alto"` + `destructive` y todos irreversibles. Tres hallazgos: **(1)** el worst case depende de la paleta del negocio — con `data-palette="green"` (`app/globals.css:189`) o `emerald` (`app/themes.css:212`) un "Eliminar" irreversible se pinta **verde**; **(2)** la firma es **fail-silent**: los dos parámetros son opcionales, así que olvidar el scope degrada sin error de tipos, y ya hay un call-site del CRM que no lo pasa (`components/crm/plan-price-card.tsx:211`); **(3)** la suite cubre el **contrato** en los dos sentidos pero **no el cableado**: `components/crm/confirm-dialog.test.tsx` tiene **0** `readFileSync`, así que borrar `shellScope` de `confirm-dialog.tsx:383` deja los 26 tests en verde. |

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
| T-14-33 | Information Disclosure | `lib/shell-scope.ts` | La constante es un literal estático de clases CSS (`'dark crm-shell'`), sin interpolación de datos del negocio ni del operador; `portalScopeClass()` devuelve su argumento tal cual. Nada nuevo llega al DOM. Riesgo residual nulo. | Reabrir si el scope pasa a componerse con cualquier dato dinámico (slug, id de negocio, preferencia del operador). |
| T-14-35 | Denial of Service | popup portaleado del `Dialog` | El peor caso de un `className` mal compuesto es una superficie mal pintada, no pérdida de disponibilidad — el popup **no se reubica** en el DOM, así que focus trap, scroll lock y stacking no cambian. Backstops ejercidos: `npm run build` exit 0 y el checkpoint humano de 14-09, que encontró 3 defectos. | Reabrir si alguna superficie portaleada pasa a recibir `container` o a reubicarse en el DOM. |
| T-14-40 | Information Disclosure | vista `/equipo` | **Justificación corregida respecto del register.** El plan la declaró como "solo un ancho de contenedor"; el alcance real incluye además haber hecho visibles Teléfono/Email en el alta de profesional (`2e3a155`). Se acepta igual porque no hay dato nuevo en el DOM: son inputs vacíos del alta, el diálogo de edición ya los mostraba siempre, `proToPayload` ya los normalizaba y el guard de sesión + tenant de `equipo/page.tsx:8-18` no se tocó. | Reabrir si la vista pasa a **prellenar** esos campos con datos existentes fuera del diálogo de edición, o si el guard de la página cambia. |

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

### Ronda 2 — flags de 14-08 y 14-09

| Origen | Flag | Mapeo |
|--------|------|-------|
| `14-08-SUMMARY.md:239-254` | "Ninguna. El diff no agrega endpoints, queries, policies ni superficie de red: son dos módulos de presentación, el `className` de un popup y el wrapper de un layout." | Declaración de ausencia. **Verificada de forma independiente:** el diff de los 5 archivos de 14-08 no agrega ni una línea con `supabase`, `select(`, `fetch(`, `insert`, `update`, `delete(` ni `token`. El guard del CRM (`app/(crm)/layout.tsx:25-32`, `is_admin` desde `app_metadata`) quedó **byte-idéntico**: el diff solo agrega el `<ShellScopeProvider>` y cambia el `className` del wrapper. |
| `14-09-SUMMARY.md` — **sin sección `## Threat Flags`** | — | **Gap de proceso.** El SUMMARY del plan que amplió el alcance a 3 archivos del CRM no declara flags. La ampliación se registra acá como **T-14-41** (§6.2). Es el segundo SUMMARY de la fase sin la sección; refuerza la observación de proceso de arriba. |

**Unregistered flags (ronda 2): 1 — `T-14-41`.** Detectado comparando `files_modified` del `14-09-PLAN.md`
(3 archivos) contra el diff real (`git diff --name-only e8f43c1..HEAD` = 4 de código). Los 3 archivos
extra —`components/crm/confirm-dialog.tsx`, `confirm-dialog.test.tsx`, `maintenance-toggle.tsx`— entraron
por una ampliación de alcance que el checkpoint humano autorizó y que **ningún `<threat_model>` modeló**,
pese a tocar la misma superficie que T-14-31 protege (la señal de peligro de una acción destructiva),
en la dirección contraria y en el panel del dueño. Dictamen en §6.2.

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

**Actualización de la ronda 2 (2026-08-11):** los 3 gaps de arriba quedaron **cerrados** por los planes
14-08 (mecanismo del scope portaleado) y 14-09 (POLISH-04 en Equipo + UAT bloqueante), con las amenazas
T-14-31…T-14-40 verificadas en §1. **Escalado nuevo:** `T-14-41` (§6.2) — WARNING, no bloqueante bajo
`block_on: high`, con dos condiciones de cierre concretas.

---

## 5. Audit trail *(ronda 1 — 2026-08-06)*

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

## 6. Security Audit 2026-08-11 — delta de los planes 14-08 y 14-09

**Alcance de esta corrida:** exclusivamente las amenazas que introdujeron los dos planes de **cierre de
gaps**, ejecutados *después* del audit del 2026-08-06 (commits `950b3a4`…`3a7f4c7`, 2026-08-10). El audit
previo se escribió cuando la fase tenía 7 planes y su registro terminaba en T-14-30: los `<threat_model>`
de `14-08-PLAN.md` y `14-09-PLAN.md` no existían todavía, así que sus 11 amenazas quedaban **sin cobertura
alguna** hasta hoy. T-14-01…T-14-30 **no se re-auditaron**; su evidencia de la ronda 1 queda intacta.

### Métricas

| Ítem | Valor |
|------|-------|
| Rango auditado | `8e0b03e..f03f295` — 16 commits (14-08: `950b3a4`…`e8f43c1`; 14-09: `2e11c40`…`3a7f4c7`; cierre: `941182a`, `f03f295`) |
| Amenazas del delta | **12** — 11 declaradas en los dos planes (T-14-31…T-14-40 + T-14-SC) + **1 no modelada** (T-14-41, encargo explícito del orquestador) |
| Declaradas cerradas | **11/11** — 8 `mitigate` verificadas contra el código, 3 `accept` registradas en §2 |
| Abiertas | **1** — T-14-41 (`unregistered_flag`, severidad WARNING) |
| Bloqueante bajo `block_on: high` | **No.** Ningún hallazgo alcanza severidad HIGH: no cambió ningún límite de autorización, ni endpoint, ni policy, ni query. El guard del CRM (`app/(crm)/layout.tsx:25-32`) y el de `/equipo` (`equipo/page.tsx:8-18`) quedaron intactos. |
| Archivos de implementación modificados por este audit | **0** (read-only; único archivo escrito: este `14-SECURITY.md`) |
| Migraciones en el delta | **0.** `git diff --name-only` del rango no toca `supabase/`. Prod sigue en la **066**. |
| Superficie de datos nueva | **0.** El delta no agrega `supabase`, `select(`, `from(`, `fetch(`, `insert`, `update`, `delete(` ni `token` en ningún archivo de código. |
| Gates re-ejecutados por el auditor | `./node_modules/.bin/tsc --noEmit` → exit **0** · `npx vitest run components/crm/confirm-dialog.test.tsx test/shell-scope.test.ts` → **26 passed (26)** |
| Suite completa | **No se corrió como gate, por instrucción.** Diagnóstico cerrado y cruzado en `14-08-SUMMARY.md:160-194` y `14-09-SUMMARY.md:265-267`: 725 passed / 9 failed / 23 suites caídas, **todas** por `Test timed out`, con 3 stacks de Supabase local levantados y 2,16 s de latencia al root. Es entorno, no código. |
| Greps de invariante re-ejecutados | `ShellScopeProvider` → 2 archivos · `<DialogContent` → 33 · `<ConfirmDialog` → 15 (10 CRM / 5 panel) · `self-start` en `settings-client` → 9 · `<ActiveTabs` → 2 · `role="radiogroup"` → 2 · POLISH-0[45] marcados → 2 · filas `Complete` de la fase → 4 · entradas `14-0[1-7]-PLAN.md` → 7 · `14-0[89]-PLAN.md` → 2 |
| ASVS | Nivel 1 · `block_on: high` · sin hallazgos HIGH · 1 hallazgo WARNING |

### 6.1 Salvedad de evidencia — la calidad de la transcripción del checkpoint (T-14-31 y T-14-38)

Se verificó lo que el `<constraint>` pide verificar: que las 7 observaciones **existan y digan lo que se
afirma**. Existen (`14-09-SUMMARY.md:117-155`) y hay además una segunda ronda. Pero **no todas dicen lo
que el plan exigía que dijeran**, y eso se registra en vez de darse por bueno:

- **Punto 1** — el criterio del plan era: *"reporta un **color concreto** para el chip 'Alto' y otro para
  el 'Medio', y un veredicto explícito de si se distinguen"*. La transcripción literal del dueño es
  **`"OK"`**. Los colores ("Alto" en rojo, "Medio" en amarillo) salen del paréntesis en cursiva que
  escribió el **ejecutor** glosando una captura, no de las palabras del dueño.
- **Punto 7** — ídem: la transcripción literal es **`"Ok"`**, cuando el criterio decía explícitamente
  *"no 'ok' a secas"*.

**Por qué igual se cierran ambas amenazas.** (a) T-14-31 tiene mitigación **de código** verificada línea
por línea, con suite de regresión y prueba de mutación transcrita — la observación humana es el arbitraje
final, no la única evidencia. (b) El punto 2 (*"Paso captura, no sé como estaba antes. Creo que queda
bien"*) prueba que el modal del CRM **se abrió y se capturó** de verdad. (c) T-14-38 se sostiene por algo
más fuerte que cualquier aprobación: **3 de las 7 observaciones reportaron defectos que ningún test veía**
y cada uno produjo un commit (`2e3a155`, `515ab6d`, `0f44da8`) más uno al backlog (`b32c5c9`). Un
checkpoint auto-aprobado no genera un reporte que cambia el código.

**Lo que queda anotado:** la afirmación "las 7 observaciones transcritas" es cierta **en forma**; en
sustancia, 5 traen observación y 2 son un "ok". Para la próxima UAT conviene que el `resume-signal`
rechace explícitamente los puntos en los que la respuesta no contenga el dato pedido (un color, un ancho),
en vez de aceptarlos y compensarlos con la glosa del ejecutor.

### 6.2 T-14-41 — dictamen del cambio no modelado (`confirmButtonClass(destructive?, shellScope?)`)

**Qué cambió.** `components/crm/confirm-dialog.tsx:210-214` — el confirmar destructivo pinta la superficie
de peligro **solo si hay un shell activo**. Reparto verificado por el auditor (`grep -rn "<ConfirmDialog"
app components` → 15): **5** en el panel del dueño pasan al primario del tema (`abonos-client.tsx:644` y
`:668`, `settings-client.tsx:2484` y `:2525`, `canchas-manager.tsx:390`) y **10** en el CRM conservan
`--danger` (`ficha-client.tsx` ×7, `pipeline-client.tsx` ×1, `maintenance-toggle.tsx` ×1,
`plan-price-card.tsx` ×1). Los conteos del SUMMARY (5 y 10) son correctos.

**Los 5 del panel son, sin excepción, `risk="alto"` + `destructive`, y los 5 borran datos de negocio de
forma irreversible:** dar de baja una serie de abono, eliminar una serie, eliminar un servicio, eliminar
un espacio, eliminar una cancha.

#### (1) ¿Degrada la señal de UX-safety hasta un punto que importe?

**Sí, parcialmente — y hay un caso peor que ninguna decisión del checkpoint contempló.**

El botón cae al `variant` default de `<Button>`, o sea `bg-primary`. **`--primary` es la paleta del
negocio**, no un color de la app: `app/globals.css:189-190` declara `[data-palette="green"] --primary:#2f8a5b`
y `app/themes.css:212-213` declara `emerald #10b981`. Consecuencia concreta: en un negocio con paleta
verde, el botón que confirma un borrado irreversible se pinta **verde** — el color semántico de
éxito/adelante. Eso no es "perder una redundancia de color": es que el color **contradice** la acción.
La decisión del dueño se tomó mirando su propio negocio de prueba, con **una** paleta; el efecto se
multiplica por las 5 paletas de `globals.css` y las de cada theme de `themes.css`.

**Lo que NO se perdió, y por eso esto es WARNING y no BLOCKER:**

- El `RiskBadge risk="alto"` sigue en el encabezado del diálogo (`confirm-dialog.tsx:308`) y sigue
  resolviendo `--danger` → `--destructive` (`globals.css:99`). Verificado: **las paletas no pisan
  `--destructive`** (solo los themes lo hacen), así que el chip rojo "Alto" sobrevive a cualquier
  `data-palette`. La señal de peligro **existe**, solo dejó de estar en el botón.
- El copy sigue diciendo lo que hay que decir: `"¿Eliminar servicio?"`, `"Esta acción no se puede
  deshacer"` (`abonos-client.tsx:685`, `:663`).
- La jerarquía no cambió: Cancelar sigue `outline` y el confirmar sigue relleno, en la misma posición.
- **Nada de esto es un control de autorización.** La autoridad real sigue server-side y no se tocó: RLS
  de la 054, el trigger `BEFORE DELETE` de la 066 y el filtro `.eq('business_id', …)` de cada escritura.
  Un click equivocado no rompe ningún límite de tenant; borra un dato que el dueño ya podía borrar.

**Veredicto sin suavizar:** el cambio **sí** degrada la señal de peligro en el panel, y en las paletas
verdes la invierte. No degrada la seguridad en el sentido de control de acceso ni de integridad de datos.
Recomendación para una fase futura (no para parchar acá): mantener la decisión del dueño —el rojo como
lenguaje del super-admin— pero darle al confirmar destructivo del panel un diferenciador **independiente
de `--primary`** (borde/tipografía sobre `--danger`, o un `ring` de peligro), de modo que ninguna paleta
pueda pintar de verde un borrado irreversible.

#### (2) ¿La firma es fail-safe o fail-silent? → **fail-silent, y el diseño invita a la regresión.**

```ts
export function confirmButtonClass(destructive?: boolean, shellScope?: string): string
```

- **Los dos parámetros son opcionales:** omitir el scope es TypeScript válido, sin diagnóstico. `tsc
  --noEmit` sale 0 con el argumento y sin él.
- **La degradación silenciosa cambia de signo según el shell:** omitir el scope produce el estado
  *correcto* en el panel y el estado *incorrecto* en el CRM. Un mismo olvido es inocuo en una superficie
  y una regresión en la otra — la condición exacta bajo la cual un error sobrevive al code review.
- **Ya existe un call-site del CRM que no pasa el scope:** `components/crm/plan-price-card.tsx:211` →
  `confirmButtonClass(false)`. Hoy es inocuo porque `destructive` es `false`; el día que esa acción pase
  a ser destructiva, cambiar el literal a `true` —la edición natural— produce un destructivo del CRM
  **sin** `--danger`, sin error de tipos y sin test rojo.
- **Los 3 call-sites, auditados uno por uno:** `confirm-dialog.tsx:383` → `confirmButtonClass(destructive,
  shellScope)` con `shellScope = useShellScope()` (`:247`) ✅ · `maintenance-toggle.tsx:53` →
  `confirmButtonClass(next, shellScope)` con `useShellScope()` (`:21`) ✅ · `plan-price-card.tsx:211` →
  `confirmButtonClass(false)`, **sin scope** ⚠ (inocuo hoy, latente mañana).
- **Había una forma fail-safe disponible a costo cero:** `shellScope: string` **requerido** (obliga a cada
  call-site a decidir, y el compilador delata al que olvida) o un único parámetro objeto. Se eligió la
  más débil de las dos.

#### (3) ¿La suite cubre la regresión en los dos sentidos? → **el contrato sí; el cableado no.**

- **Contrato, cubierto en ambas direcciones:** `components/crm/confirm-dialog.test.tsx:156-166` (dentro
  del shell ⇒ `var(--danger)` + `var(--danger-foreground)`, sin `crm-danger` ni `destructive`) y
  `:172-177` (fuera del shell ⇒ `''`, incluidas las variantes `''` y `'   '`). Correcto y explícito.
- **Cableado, sin cubrir:** `grep -c "readFileSync" components/crm/confirm-dialog.test.tsx` → **0**. La
  suite invoca el helper con literales; ninguna aserción lee `confirm-dialog.tsx:383` ni
  `maintenance-toggle.tsx:53`. **Borrar `shellScope` de cualquiera de los dos call-sites deja los 26 tests
  en verde mientras los 10 `ConfirmDialog` del CRM pierden su superficie de peligro.**
- **La asimetría es el hallazgo:** para el *mismo tipo de defecto* sobre el popup, el plan 14-08 sí
  construyó el guard correcto —`test/shell-scope.test.ts:61-118` (describe de cableado por lectura de
  fuentes) **más** prueba de mutación transcrita—. La corrección C, hecha bajo la presión del checkpoint,
  se quedó una capa más abajo.

#### Condiciones de cierre de T-14-41

1. **Guard de cableado + prueba de mutación**, con el molde que ya existe en `test/shell-scope.test.ts`:
   una aserción por lectura de fuentes que falle si `confirm-dialog.tsx` o `maintenance-toggle.tsx` dejan
   de pasar el scope a `confirmButtonClass`. Cierra el fail-silent de los call-sites vivos.
2. **Decisión explícita sobre el peor caso de paleta** (un "Eliminar" irreversible pintado con
   `--primary` verde): o se le da al destructivo del panel un diferenciador independiente de la paleta, o
   se registra como riesgo aceptado con la firma del dueño, dejando escrito que se evaluó **con las 5
   paletas a la vista** y no solo con la del negocio de prueba.

Hasta que una de las dos pase, T-14-41 queda **OPEN (WARNING)**. No bloquea el cierre de la fase 14 ni el
deploy: no toca autorización, ni datos, ni disponibilidad.

> **Estado posterior:** las **dos** condiciones se satisficieron en la ronda 3 (§7). El dueño eligió
> arreglar en vez de aceptar, habiendo visto la tabla de paletas.

---

## 7. Security Audit 2026-08-11 (ronda 3) — remediación de T-14-41

**Rango:** `f03f295..c7d4728` · **Veredicto: T-14-41 CLOSED** · `threats_open: 0`

El dueño, con la tabla de paletas a la vista, eligió **arreglar** en vez de aceptar el riesgo. Tres
commits atómicos, ninguno sobre `app/globals.css`, `app/themes.css` ni `components/crm/risk-badge.tsx`.

| Commit | Sub-fix | Qué cierra |
|---|---|---|
| `79458f1` | Outline de peligro en el panel | Hallazgo 1 — la señal ya no depende de la paleta del negocio |
| `8a3a271` | `shellScope` pasa a parámetro **requerido** | Hallazgo 2 — la firma deja de ser fail-silent |
| `c7d4728` | Aserciones de cableado + prueba de mutación | Hallazgo 3 — la brecha de test |

### Condición de cierre 1 — guard de cableado + mutación · **SATISFECHA**

`grep -c readFileSync components/crm/confirm-dialog.test.tsx` pasó de **0** a **4**. Suites:
46/46 (baseline previa 32).

Prueba de mutación transcrita: quitar `shellScope` de la llamada en `confirm-dialog.tsx` hace fallar
`cableado de confirmButtonClass (regresión de T-14-41) > ConfirmDialog lee el scope del shell activo y
se lo pasa al className del confirmar`, con
`AssertionError: expected … to match /className=\{confirmButtonClass\([^)]*\bshellScope\b[^)]*\)\}/`.
Restauración verificada byte-idéntica.

**Guard adicional no previsto por el dictamen:** con `shellScope` requerido, la misma mutación además
rompe el typecheck — `error TS2554: Expected 2 arguments, but got 1`. El defecto ahora muere en dos
capas independientes, no en una.

### Condición de cierre 2 — diferenciador independiente de la paleta · **SATISFECHA**

```
destructive + shell   → bg-[var(--danger)] text-[var(--danger-foreground)] hover:bg-[var(--danger-hover)]
destructive sin shell → border-2 border-[var(--danger)] bg-transparent text-foreground
                        hover:bg-[var(--danger)] hover:text-[var(--danger-foreground)]
```

- **La rama del shell es byte-idéntica** a la de `f03f295` (verificado con `git show`): los 10 modales
  del CRM que el dueño aprobó no cambian. El delta está confinado a la rama sin-shell (5 modales del panel).
- **Premisa del fix verificada contra el código, no asumida:** ningún bloque `[data-palette=…]` de
  `globals.css` ni de `themes.css` redeclara `--destructive` — solo mueven
  `--primary`/`--accent`/`--ring`/`--sidebar-primary`/`--chart-1`/`--tint`. Como `--danger` resuelve a
  `--destructive` en el dashboard, el botón queda fuera del alcance de la paleta del negocio.
- **D-07 se sigue cumpliendo:** la rama nueva solo nombra `--danger`, nunca `--crm-danger` ni
  `--destructive` directo.
- **`bg-transparent` es load-bearing**, no decorativo: es lo que neutraliza el `bg-primary` del variant
  `default` del `Button` (tailwind-merge se queda con el último de cada grupo). Sin él vuelve el verde.

### Desviación del encargo, y por qué

El brief pedía borde **y texto** en `var(--danger)`. Medido con `lib/contrast.ts`, ese par **no pasa AA
(4.5:1)** contra el `--popover` del diálogo en la mayoría de los temas — incluido el Forjo oscuro, que
queda en **4.45:1**. Se shipeó el label en `--foreground` y la señal de peligro en el **borde**:

| Estado | Par | Claro | Oscuro | Veredicto |
|---|---|---|---|---|
| Reposo — texto | `--foreground` / `--popover` | 15.16:1 | 12.14:1 | AA |
| Reposo — borde (no-texto, ≥3:1) | `--danger` / `--popover` | 5.40:1 | ~~4.45:1~~ **4.22:1** | 1.4.11 |
| Hover — relleno | `--danger-foreground` / `--danger` | 5.40:1 | 4.91:1 | AA |

> **Corrección de medición (code review, WR-A2).** Los ratios de arriba se midieron contra `--popover`,
> pero el botón se renderiza sobre el `DialogFooter`, que es `bg-muted/50` **compuesto** sobre
> `--popover` (`dialog.tsx:118`). Contra la superficie real, el borde en Forjo oscuro da **4.22:1**, no
> 4.45:1 — sigue por encima del 3:1 que le corresponde a un elemento de no-texto, así que el veredicto
> no cambia. La guarda del test se extendió a **32 contextos** (4 themes × sus paletas × claro/oscuro,
> con `color-mix(in oklab, …)` resuelto en el test porque los neutrales de `themes.css` dependen de
> `--tint`) y ahora mide la superficie compuesta. Commit `6bc21d4`.

Los tres ratios quedan asentados en test leyendo los hex reales de `app/globals.css`, vía el export
aditivo `contrastRatioHex` de `lib/contrast.ts` (misma matemática que ya usaba `onAccentText`; no se
duplicó WCAG en el test).

**Consecuencia a nombrar:** en reposo la única señal de peligro es el **borde**. Es estrictamente mejor
que el estado anterior —donde un borrado irreversible podía pintarse verde— y que el original —donde el
botón relleno duplicaba el rojo del chip "Alto"—, pero es una señal más tenue que un relleno. Queda
sujeto a confirmación visual del dueño sobre los 5 modales del panel.

### Hallazgos residuales — registrados, no escondidos

| # | Hallazgo | Disposición |
|---|---|---|
| R-1 | En `spa` claro el borde queda en ~~2.72:1~~ **2.47–2.48:1** (según la paleta), debajo del 3:1 de WCAG 1.4.11 (`--destructive:#c0876b` es un terracota claro). **Número corregido por el code review (WR-A2):** el 2.72 salía de medir contra `--popover` puro; contra la superficie real del `DialogFooter` es 2.47–2.48:1. No se puede corregir sin tocar `app/themes.css`, fuera de alcance. Atenuante: el label sí pasa AA, y el sistema ya shipea el borde del `variant outline` de "Cancelar" en ≈1.3:1. Desde el commit `6bc21d4` el residual está **afirmado por igualdad** en test: un residual nuevo pone la suite roja, y arreglar `spa` también — así el número no puede volver a quedar desactualizado en silencio. | accept — anotado |
| R-2 | **Deuda pre-existente, ajena a este fix:** el par relleno del CRM `--crm-danger-foreground #fbf3e3` sobre `--crm-danger #e85c3f` da **3.15:1**, debajo de AA. Afecta a los 10 modales del CRM **y al chip "Alto" dentro del shell**. Requiere tocar `app/globals.css`. | escalado — candidato a todo propio |
| R-3 | La remediación **no tuvo UAT visual**. Los 5 modales afectados: baja y borrado de serie (`abonos-client.tsx:644,668`), borrado de servicio y de espacio (`settings-client.tsx:2484,2525`), borrado de cancha (`canchas-manager.tsx:390`). | pendiente de confirmación del dueño |

### Gates de la ronda 3

`./node_modules/.bin/tsc --noEmit` exit **0** · `npm run build` exit **0** ·
`npx vitest run components/crm/confirm-dialog.test.tsx test/shell-scope.test.ts lib/contrast.test.ts`
**46/46** · anti-regresión de la fase: 9 `self-start`, 2 `<ActiveTabs`, `ShellScopeProvider` en 2
archivos, 10 `ConfirmDialog` en el CRM / 5 en el panel · sin `package.json` ni `package-lock.json` en el
diff. Suite completa **no** usada como gate: entorno degradado (Supabase local a 2.16s, timeouts de 5s),
diagnóstico cerrado y ajeno al código.

---

*Phase: 14-cierre-de-backlog · Workstream: motor-reservas · Ronda 1: 2026-08-06 · Ronda 2: 2026-08-11 · Ronda 3: 2026-08-11*
