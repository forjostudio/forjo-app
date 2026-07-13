# Phase 3: Impersonación Read-Only - Context

**Gathered:** 2026-06-19
**Status:** Ready for planning
**Source:** discuss-phase (8 decisiones del operador sobre arquitectura, alcance, motivo, auditoría, entrada, tema, legal y PII) + brief LOCKED §7/§11 + Phase 1 (cimientos) + Phase 2 (ficha de negocio).

<domain>
## Phase Boundary

El operador puede "ver como cliente" cualquier negocio en modo SOLO LECTURA para soporte, con la garantía real de que ningún write puede ocurrir bajo la vista impersonada, scope estricto por `business_id` (cero fuga cross-tenant) y cada acceso auditado con motivo. Se monta sobre los cimientos de Phase 1 (`requireAdmin()`, `logAudit()`, `ConfirmDialog` nivel "VER", `audit_log`) y la ficha de Phase 2 (`/admin/negocios/[id]`). Requirements: IMP-01, IMP-02, IMP-03.

**Fuera de scope (otras fases):** pipeline/tags/timeline (Phase 4), reportes/charts (Phase 5), bandeja/comms (Phase 6). La capa visual del CRM ya está cerrada por los mockups + `01-UI-SPEC.md`. Esta discusión decide el CÓMO de la impersonación, no agrega capacidades nuevas.
</domain>

<decisions>
## Implementation Decisions

Decisiones CERRADAS por el operador en discuss-phase. El research/planner NO las re-litiga.

### Arquitectura de la vista y garantía read-only (IMP-01)
- **D-01:** **Vista DEDICADA dentro de `/admin`** (ej. `/admin/negocios/[id]/ver`), NO se reusa el dashboard real del cliente con su sesión. El operador sigue siendo él mismo (su sesión admin); solo LEE datos de otro negocio. Se descartó explícitamente la opción A (reusar el dashboard real con cookie de impersonación + kill-switch global de writes) por ser superficie de riesgo grande para la acción más peligrosa del sistema.
- **D-02:** **Read-only POR CONSTRUCCIÓN.** La superficie de impersonación NO tiene NINGÚN write path (ni server action de mutación, ni route handler de escritura). Como no existe forma de mutar, IMP-01 se cumple sin necesidad de interceptar/bloquear nada (no hay kill-switch). Esta es LA garantía server-side; la UI deshabilitada NO es la garantía (brief §11 fix #1).
- **D-03:** La lectura cross-tenant se hace SIEMPRE vía **service-role acotado por `business_id`** (`createAdminClient()` + `.eq('business_id', ...)`), nunca vía la sesión del cliente ni confiando en IDs del request (brief §6/§11; convención anti-tampering del proyecto).
- **D-04:** **Modelo = sub-página navegable, sin estado global.** Impersonar = navegar a la sub-página tras el type-to-confirm "VER" + motivo. NO hay cookie/flag de "modo impersonación" persistente que siga al operador por el CRM. Salir de la vista = navegar a otra parte del CRM (no requiere apagar un estado). Esto elimina el problema de "impersonación abierta olvidada" → NO se necesita auto-expiración por timeout.

### Alcance de datos visibles (IMP-03) — decisión de negocio/legal
- **D-05:** Alcance **OPERATIVO**: el operador ve agenda/turnos, servicios, equipo, consultorios, configuración del negocio, y el contacto de los clientes finales.
- **D-06:** **EXCLUIDO de la vista:** la **historia clínica** de pacientes (datos de salud = categoría especial, brief §7) y las **finanzas** del cliente (revenue propio, sensible y no necesario para soporte técnico). Estas dos secciones NO se renderizan bajo impersonación.

### Motivo (IMP-02)
- **D-07:** El motivo obligatorio se captura como **texto libre obligatorio con mínimo de caracteres** (para evitar motivos basura tipo "a"), dentro del `ConfirmDialog` nivel "VER". Se descartó lista predefinida de motivos para v1 (un solo operador, fricción innecesaria). El texto va tal cual a `audit_log.reason`.

### Auditoría (IMP-02)
- **D-08:** **Un registro por acceso**, escrito recién cuando se confirma el "VER" + motivo. Forma: `actor_id` (operador), `action='impersonate'`, `target_type='business'`, `business_id`, `risk='alto'`, `reason` = motivo, timestamp. Vía `logAudit()` (Phase 1, service-role).
- **D-09:** Como es sub-página navegable, **cada entrada a la vista (incluidas re-entradas) re-pide motivo y genera una fila nueva** en `audit_log`. NO se audita por pantalla/sección vista (sería ruido para un solo operador y excede el brief).

### Punto de entrada y negocios elegibles (IMP-01)
- **D-10:** El "Ver como cliente" es una **acción en la ficha de Phase 2** (`/admin/negocios/[id]`), junto a las demás acciones gateadas. (NO se agrega atajo desde el directorio en v1 → menos superficie para la acción más peligrosa.)
- **D-11:** Se puede impersonar negocios en **CUALQUIER estado** — activos, trial, vencidos y **suspendidos** — porque es read-only y el soporte se necesita justo cuando el negocio tiene un problema (ej. suspendido por error). El estado del negocio se refleja en el contexto/banner.

### Tema y fidelidad visual (IMP-03)
- **D-12:** La vista usa la **paleta/tema/fuente del negocio impersonado** (vía `PaletteScript`, como el dashboard real) para que el operador vea LO QUE VE EL CLIENTE (soporte visual). El **banner amarillo "Estás viendo como X · solo lectura"** queda fijo arriba con acción "Salir de la vista" (comportamiento del mock a preservar, brief §11).
- **D-13:** La vista **reusa los componentes PRESENTACIONALES del dashboard** alimentados con data read-only ya cargada server-side. ⚠ Implicación para research/plan: componentes del dashboard que hoy **fetchean o mutan por sí mismos** necesitarán una **variante read-only por props** (recibir data, sin botones de acción ni mutaciones). Identificar esos componentes es trabajo de research/plan.

### Base legal / consentimiento (brief §7 #4)
- **D-14:** En v1 se construye **disclaimer en el `ConfirmDialog` "VER"** (copy: acceso de soporte solo lectura, queda auditado con identidad + motivo, uso responsable de datos de terceros) + la auditoría de D-08. Con historia clínica EXCLUIDA (D-06), esto es proporcionado. La **revisión legal formal** (cláusula en términos de servicio / base de consentimiento) es **acción del operador FUERA de esta fase** — no la bloquea, pero conviene resolverla antes del primer cliente del vertical salud (ver Deferred).

### PII de clientes finales (IMP-03)
- **D-15:** El contacto de los clientes del negocio (nombre, teléfono, email) se muestra **completo**, como lo ve el cliente. Es PII de terceros pero NO categoría especial, y el soporte normalmente lo necesita; el acceso ya queda auditado con motivo. NO se construye masking en v1.

### Claude's Discretion
- Estructura exacta de archivos/rutas dentro de `app/(crm)/admin/negocios/[id]/` para la sub-página de impersonación.
- Forma concreta de la capa de lectura read-only (lib/helper de SELECT service-role scoped por `business_id`) y qué queries exactas alimentan cada sección operativa (agenda/turnos/servicios/equipo/consultorios/config/clientes).
- Qué componentes presentacionales del dashboard se reusan tal cual vs. requieren variante read-only (D-13) — mapear en research/plan.
- Nombre exacto del `action` string en `audit_log` (sugerido `impersonate`) y el `risk` ('alto').
- Cero paquetes npm nuevos (confirmado en Phase 1/2).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements y roadmap de la fase
- `.planning/workstreams/crm/REQUIREMENTS.md` — IMP-01, IMP-02, IMP-03 (+ Out of Scope / v2)
- `.planning/workstreams/crm/ROADMAP.md` — Phase 3 success criteria + dependencia de Phase 2

### Phase 1 (cimientos que esta fase reusa)
- `.planning/workstreams/crm/phases/01-cimientos-auditor-a/01-CONTEXT.md` — D1..D7 (is_admin en app_metadata, /admin route group, audit_log, requireAdmin, ConfirmDialog escalonado, tema CRM)
- `.planning/workstreams/crm/phases/01-cimientos-auditor-a/01-UI-SPEC.md` — contrato visual: ConfirmDialog nivel "VER", RiskBadge, visor de auditoría, copy
- `.planning/workstreams/crm/phases/01-cimientos-auditor-a/01-SECURITY.md` — mitigaciones ASVS de los cimientos
- `.planning/workstreams/crm/phases/01-cimientos-auditor-a/01-RESEARCH.md` — patrones verificados, pitfalls (ej. Pitfall 2: actions invocadas directo no pasan por el layout → requireAdmin obligatorio)

### Phase 2 (ficha sobre la que se monta el punto de entrada)
- `.planning/workstreams/crm/phases/02-admin-de-plataforma/02-CONTEXT.md` — ficha `/admin/negocios/[id]`, patrón server action requireAdmin+logAudit, estado `suspended`

### Brief y diseño (NO en repo)
- `c:\Users\franc\Desktop\Forjo Studio\forjo-crm-admin-brief.md` — §6 (aislamiento/impersonación service-role acotado), §7 (impersonación = la más peligrosa, datos de salud, base legal), §8 (cero fugas), §11 (banner + type-to-confirm "VER" + fix #1 read-only REAL server-side)
- `c:\Users\franc\Desktop\Forjo Studio\crm-design\04-ficha-resumen.png` — ficha desde donde se dispara "Ver como cliente"
- `c:\Users\franc\Desktop\Forjo Studio\crm-design\Forjo Consola CRM (offline).html` — comportamiento de referencia del banner (MOCK; el read-only del mock es no-op visual — re-implementar real)

### Código del codebase a calcar / extender (rutas reales)
- `lib/admin-guard.ts` (`requireAdmin()`) — guard server-side en cada handler/loader de la impersonación
- `lib/audit.ts` (`logAudit()`) — registro del acceso (D-08)
- `lib/supabase/admin.ts` (`createAdminClient()`) — única vía de lectura cross-tenant, siempre `.eq('business_id', ...)` (D-03)
- `app/(dashboard)/layout.tsx:17-20` — patrón actual de resolución de `business` por `owner_id` (lo que la impersonación NO debe usar; lee por `business_id` impersonado)
- `app/(dashboard)/` — secciones fuente para reusar componentes presentacionales (agenda, appointments, clients, consultorios, equipo, servicios, negocio, settings). EXCLUIR `clinical-history` y `finances` (D-06)
- `components/palette-script.tsx` (`PaletteScript`) — aplicar paleta/tema del negocio impersonado (D-12)
- `components/crm/confirm-dialog.tsx` — `ConfirmDialog` nivel "VER" + campo motivo + disclaimer (D-07/D-14)
- `supabase/migrations/` — última migración aplicada (032/033 según checkpoint humano pendiente); esta fase probablemente NO necesita migración nueva (audit_log ya existe), confirmar en plan

### Reglas del proyecto (skills)
- `.claude/skills/supabase-multitenant-rls/SKILL.md` — checklist de aislamiento para la capa de lectura service-role
- `.claude/skills/convenciones-forjo/SKILL.md` — naming, estructura, manejo de errores
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `requireAdmin()` + `logAudit()` (Phase 1): guard + auditoría de cada acceso impersonado.
- `ConfirmDialog` nivel "VER" (Phase 1, locked): type-to-confirm + se le agrega campo de motivo obligatorio + disclaimer legal (D-07/D-14).
- `createAdminClient()`: lectura service-role acotada por `business_id` (D-03).
- `PaletteScript`: aplica tema/paleta del negocio para fidelidad visual (D-12).
- Componentes presentacionales del dashboard del cliente: reusables en read-only (D-13), salvo `clinical-history` y `finances`.
- Ficha `/admin/negocios/[id]` (Phase 2): punto de entrada del botón "Ver como cliente" (D-10).

### Established Patterns
- `page.tsx` server component async → fetch Supabase → componente client co-ubicado. La sub-página de impersonación sigue este patrón pero fetchea por `business_id` impersonado, no por `owner_id`.
- Guard en CADA loader/handler (Pitfall 2 de Phase 1): la sub-página NO confía en el guard del layout.
- Read-only por construcción = no exponer server actions de mutación en esta superficie (la garantía, no la UI).

### Integration Points
- Botón "Ver como cliente" en la ficha de Phase 2 → ConfirmDialog "VER" + motivo → registra audit → navega a la sub-página.
- `audit_log`: nueva `action='impersonate'`, `risk='alto'`, `business_id`, `reason` (sin migración nueva; tabla de Phase 1).
- Sub-página lee con service-role scoped por `business_id` y renderiza secciones operativas con tema del negocio + banner fijo.
</code_context>

<specifics>
## Specific Ideas

- "Estás viendo como X · solo lectura" + "Salir de la vista" — preservar copy/comportamiento del mock (brief §11).
- Read-only del mock es no-op (pointerEvents visual): en el build la garantía es server-side por construcción, NO el banner ni la UI deshabilitada (brief §11 fix #1).
- "Ver como cliente" = ver LO QUE VE EL CLIENTE → tema del negocio, no shell CRM dark.
- Un solo operador, bajo tráfico → preferir simplicidad (sub-página sin estado global) sobre infra (cookies de modo / timeouts).
</specifics>

<deferred>
## Deferred Ideas

- **Revisión legal formal de impersonación** (cláusula en términos de servicio / base de consentimiento para datos de terceros, especialmente vertical salud) → acción del operador FUERA de esta fase; resolver antes del primer cliente de salud (D-14). No bloquea el build.
- **Incluir historia clínica y/o finanzas en la vista** → requeriría base legal/consentimiento explícito (categoría especial / dato sensible); fuera de v1 (D-06).
- **Gate de consentimiento registrado por negocio** (flag de consentimiento antes de habilitar impersonación) → v2 si la revisión legal lo exige (D-14).
- **Masking de PII de clientes finales** → no en v1 (D-15); reconsiderar si cambia la postura de privacidad.
- **Atajo de impersonación desde el directorio** + **modo impersonación persistente con auto-expiración** → descartados en v1 (D-04/D-10); reconsiderar solo si hay más de un operador.
- **Auditoría por pantalla/sección vista** → descartada en v1 (D-09); reconsiderar si se requiere trazabilidad fina.

None — discussion stayed within phase scope (los diferimientos de arriba son decisiones explícitas, no scope creep).
</deferred>

---

*Phase: 03-impersonaci-n-read-only*
*Context gathered: 2026-06-19 via discuss-phase*
