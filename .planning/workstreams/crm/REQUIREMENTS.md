# Requirements: Forjo App — Consola CRM (v0.11)

**Defined:** 2026-06-17
**Workstream:** crm
**Core Value:** Un negocio NUNCA puede leer ni modificar datos de otro. El CRM y la impersonación son la superficie MÁS sensible del sistema — no pueden filtrar datos entre tenants bajo ninguna circunstancia.
**Brief:** `c:\Users\franc\Desktop\Forjo Studio\forjo-crm-admin-brief.md` · **Diseño:** `c:\Users\franc\Desktop\Forjo Studio\crm-design\`

## v1 Requirements

Requirements del milestone v0.11. Actor primario: **operador** (Forjo Studio, único usuario, `is_admin = true`). Sujetos de datos: **lead/prospecto**, **negocio (tenant)**. Scope cerrado por el brief §1 (decisiones LOCKED), §10 (roadmap sugerido) y §12 (incorporaciones aprobadas).

### Cimientos & Auditoría (FND)

- [x] **FND-01**: El operador accede a `/admin` solo si tiene `is_admin = true`, validado server-side en el layout; cualquier otro usuario es redirigido (nunca render parcial ni guard solo-cliente).
- [x] **FND-02**: Toda acción sensible (cambio de plan, edición de precios, suspensión, activación de add-ons, cada impersonación, otorgar `is_admin`) queda registrada en una tabla `audit_log` con quién, qué, cuándo y motivo cuando aplica.
- [x] **FND-03**: Las acciones peligrosas exigen doble confirmación con type-to-confirm escalonado por riesgo (ej. Suspender → "SUSPENDER"; Impersonar → "VER"; Editar precio → "CONFIRMAR"; cambiar plan → confirmación simple), como patrón reutilizable.
- [x] **FND-04**: El CRM tiene un layout/shell propio anclado al tema Forjo default (modo oscuro principal, acentos amarillo principal / azul info / rojo SOLO peligro), reusando los componentes de la app (cards, tablas, badges, tabs, dialog, toasts, sidebar agrupado).

### Admin de Plataforma (ADM)

- [x] **ADM-01**: El operador ve un directorio de negocios buscable y filtrable; los negocios suspendidos siguen visibles y marcados.
- [x] **ADM-02**: El operador abre la ficha de un negocio y ve plan, `plan_status`, estado de suscripción MP, contacto (email + WhatsApp, ambos obligatorios) y add-ons activos.
- [x] **ADM-03**: El operador cambia el plan de un negocio desde la ficha (con confirmación + registro en auditoría).
- [x] **ADM-04**: El operador suspende un negocio o extiende su trial desde la ficha (doble confirmación + auditoría).
- [x] **ADM-05**: El operador edita los precios de los planes desde el panel (doble confirmación + auditoría); editar un precio no altera suscripciones ya activas sin aviso explícito.
- [x] **ADM-06**: El operador activa/desactiva add-ons por negocio como flags booleanas (ej. `has_web_custom`, `has_whatsapp`); la activación queda auditada y el cobro se gestiona por fuera (manual).
- [x] **ADM-07**: El dashboard del CRM muestra KPIs de operación (negocios activos, trials por vencer, pagos fallidos, MRR) arriba de todo.

### Impersonación Read-Only (IMP)

- [x] **IMP-01**: El operador puede "ver como cliente" un negocio en modo SOLO LECTURA, con la garantía server-side de que ningún write puede ocurrir bajo la sesión impersonada (la UI deshabilitada es solo refuerzo, no la garantía). _(garantía por construcción en 03-01; refuerzo UI en 03-02: superficie /ver sin write paths)_
- [x] **IMP-02**: Iniciar una impersonación exige doble confirmación y un motivo obligatorio, y registra cada acceso en auditoría (quién, qué negocio, cuándo, motivo). _(backbone server-side en 03-01 + doble-confirm UI del botón "VER" con motivo min 10 en 03-02)_
- [x] **IMP-03**: La impersonación lee con scope estricto por `business_id` (cero fuga cross-tenant) y muestra siempre un banner "Estás viendo como X · solo lectura" con acción de salir. _(scope en 03-01; banner + "Salir de la vista" + paleta del negocio en 03-02)_

### Notificaciones / Alertas (ALERT)

- [x] **ALERT-01**: El operador ve en el panel alertas de eventos urgentes (pago falló, trial por vencer), reusando la lógica de webhooks de suscripción existente.

### Pipeline de Ventas (PIPE)

- [ ] **PIPE-01**: Un lead (frío o signup de trial) entra al pipeline en una etapa inicial, persistido en tablas `leads`/`deals`.
- [ ] **PIPE-02**: El operador mueve leads entre etapas en un tablero de pipeline (lead → trial → propuesta → pago).
- [ ] **PIPE-03**: Al registrarse, un lead se convierte en `business` (tenant) y queda vinculado a su historial de pipeline.
- [x] **PIPE-04**: El operador asigna tags (color + texto) a leads y negocios, y filtra por tag en el pipeline y el directorio.

### Comunicaciones — Bandeja (COMMS)

- [x] **COMMS-01**: El operador ve una bandeja unificada con las conversaciones de WhatsApp (del agente) y los mails, asociadas al lead/negocio.
- [x] **COMMS-02**: Cada conversación muestra su estado (IA atendiendo / Vos atendés / Sin asignar); el operador puede "tomar la conversación" y al hacerlo el agente pausa.
- [x] **COMMS-03**: La bandeja recibe y responde mail (two-way), no solo saliente transaccional.

### Timeline de Actividades (TL)

- [ ] **TL-01**: La ficha de un negocio/lead tiene una pestaña de timeline con el historial cronológico unificado (comms WhatsApp+mail, tareas, notas, cambios de plan/estado, impersonaciones), distinto de la Bandeja (charla en vivo).

### Reportes de Ventas (RPT)

- [x] **RPT-01**: El operador ve reportes de revenue por mes y MRR.
- [x] **RPT-02**: El operador ve conversión por etapa y ranking, con gráficos interactivos.

## v2 Requirements

Reconocidos pero diferidos — no entran en el roadmap de v0.11.

- **NOTIF-EXT-01**: Canal externo de alertas (email/push) además del panel (brief A9: "canal extra a definir").
- **ADDON-PAY-01**: Cobro automático de add-ons (en v1 el cobro de add-ons es manual, fuera de la app — A5).

## Out of Scope

| Feature | Reason |
|---------|--------|
| Separar Contactos de Empresas | El modelo de Forjo es dueño-solo; el lead se convierte en Negocio con su dueño embebido. No copiar el split de Divisual (brief §12 "descartado") |
| Cobro automático de add-ons | A5: add-ons son flags on/off, el cobro va por fuera (manual) en v1 |
| Otorgar `is_admin` self-serve desde el panel | A7/§7: "las llaves del reino" — no self-serve; barrera extra o fuera del panel |
| Multi-operador / roles granulares | Usuario único (vos) en v1; no hay modelo de permisos más allá de `is_admin` |
| CRM themeable por usuario | §12: el CRM NO es themeable, se ancla al tema Forjo default |

## Traceability

> Mapeo creado por gsd-roadmapper al crear ROADMAP.md. Cada requirement mapea a exactamente una fase; cobertura 100% (25/25).

| Requirement | Phase | Status |
|-------------|-------|--------|
| FND-01 | Phase 1 | Complete |
| FND-02 | Phase 1 | Complete |
| FND-03 | Phase 1 | Complete |
| FND-04 | Phase 1 | Complete |
| ADM-01 | Phase 2 | Complete |
| ADM-02 | Phase 2 | Complete |
| ADM-03 | Phase 2 | In progress (mutación + auditoría en 02-02; UI ficha en 02-04) |
| ADM-04 | Phase 2 | In progress (suspend/extendTrial + auditoría en 02-02; UI ficha en 02-04) |
| ADM-05 | Phase 2 | In progress (updatePlanPrice + auditoría en 02-02; editor en 02-04) |
| ADM-06 | Phase 2 | In progress (toggleAddon + auditoría en 02-02; toggle UI en 02-04) |
| ADM-07 | Phase 2 | Complete |
| ALERT-01 | Phase 2 | Complete |
| IMP-01 | Phase 3 | Complete (03-01/03-02) |
| IMP-02 | Phase 3 | Complete (03-01/03-02) |
| IMP-03 | Phase 3 | Complete (03-02) |
| PIPE-01 | Phase 4 | Pending |
| PIPE-02 | Phase 4 | Pending |
| PIPE-03 | Phase 4 | Pending |
| PIPE-04 | Phase 4 | Complete |
| TL-01 | Phase 4 | Pending |
| RPT-01 | Phase 5 | Complete |
| RPT-02 | Phase 5 | Complete |
| COMMS-01 | Phase 6 | Complete |
| COMMS-02 | Phase 6 | Complete |
| COMMS-03 | Phase 6 | Complete |

**Coverage:**

- v1 requirements: 25 total (FND 4 · ADM 7 · IMP 3 · ALERT 1 · PIPE 4 · COMMS 3 · TL 1 · RPT 2)
- Mapped to phases: 25/25 (100%)
- Unmapped: 0
- Duplicates: 0

**Phase → requirements:**

- Phase 1 — Cimientos & Auditoría: FND-01, FND-02, FND-03, FND-04 (4)
- Phase 2 — Admin de Plataforma: ADM-01..07, ALERT-01 (8)
- Phase 3 — Impersonación Read-Only: IMP-01, IMP-02, IMP-03 (3)
- Phase 4 — Pipeline, Tags & Timeline: PIPE-01..04, TL-01 (5)
- Phase 5 — Reportes de Ventas: RPT-01, RPT-02 (2)
- Phase 6 — Comms (Bandeja): COMMS-01, COMMS-02, COMMS-03 (3)

---
*Requirements defined: 2026-06-17 — workstream crm, numeración de fases reiniciada en Phase 1. Traceability mapeada por roadmapper 2026-06-17.*
