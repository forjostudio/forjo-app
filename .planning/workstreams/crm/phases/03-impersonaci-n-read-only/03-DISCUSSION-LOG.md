# Phase 3: Impersonación Read-Only - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-19
**Phase:** 3-Impersonación Read-Only
**Areas discussed:** Arquitectura de la vista, Alcance de datos visibles, Motivo + fin de sesión, Granularidad de auditoría, Punto de entrada + suspendidos, Tema/fidelidad visual, Base legal/consentimiento, PII de clientes finales

---

## Arquitectura de la vista

| Option | Description | Selected |
|--------|-------------|----------|
| B: Vista dedicada en /admin | Superficie nueva con SELECT service-role scoped; read-only por construcción, sin write paths | ✓ |
| A: Reusar el dashboard real read-only | Cookie de impersonación + resolver por business_id + kill-switch global de writes; fiel pero alto riesgo | |
| Híbrido: vista dedicada que reusa componentes | Dedicada + componentes presentacionales del dashboard | (parcial — ver Tema) |

**User's choice:** B — Vista dedicada en /admin.
**Notes:** Elimina kill-switch global; IMP-01 se cumple por construcción. La fidelidad visual se recupera después vía el reuso de componentes presentacionales (decisión de Tema).

## Modelo de sesión

| Option | Description | Selected |
|--------|-------------|----------|
| Sub-página navegable | Sin estado global; salir = navegar fuera; sin auto-expiración | ✓ |
| Modo persistente con estado | Cookie/flag que sigue al operador hasta "Salir"; requiere auto-expiración | |

**User's choice:** Sub-página navegable.
**Notes:** Resuelve el "fin de sesión" sin timeout; el operador sigue siendo él mismo.

## Alcance de datos visibles

| Option | Description | Selected |
|--------|-------------|----------|
| Operativo sin salud ni finanzas | Agenda/turnos, servicios, equipo, consultorios, config, contacto clientes; excluye historia clínica y finanzas | ✓ |
| Todo menos historia clínica | Incluye finanzas, excluye solo historia clínica | |
| Todo el dashboard, sin excepción | Máxima fidelidad, máximo riesgo legal | |

**User's choice:** Operativo sin salud ni finanzas.
**Notes:** Minimiza peso legal (brief §7) manteniendo útil el soporte.

## Motivo

| Option | Description | Selected |
|--------|-------------|----------|
| Texto libre obligatorio | Mín. caracteres, en ConfirmDialog "VER" → audit_log.reason | ✓ |
| Lista predefinida + texto libre | Dropdown de motivos + libre opcional | |

**User's choice:** Texto libre obligatorio.

## Granularidad de auditoría

| Option | Description | Selected |
|--------|-------------|----------|
| Un registro por acceso | Una fila al confirmar "VER"; re-entrada = nueva fila | ✓ |
| Registro por acceso + por pantalla | Fila por cada sección abierta | |

**User's choice:** Un registro por acceso.

## Punto de entrada + suspendidos

| Option | Description | Selected |
|--------|-------------|----------|
| Botón en la ficha, cualquier estado | Acción en /admin/negocios/[id]; impersonable en cualquier estado incl. suspendidos | ✓ |
| Botón en la ficha, solo activos/trial | Deshabilitado para suspendidos/vencidos | |
| También desde el directorio | Atajo extra desde la fila del directorio | |

**User's choice:** Botón en la ficha, cualquier estado.
**Notes:** El soporte se necesita justo cuando el negocio tiene problemas (ej. suspendido por error).

## Tema/fidelidad visual

| Option | Description | Selected |
|--------|-------------|----------|
| Tema del negocio impersonado | Paleta/tema/fuente del negocio vía PaletteScript; reusa componentes presentacionales del dashboard read-only; banner fijo | ✓ |
| Shell CRM dark | Datos en tablas/cards del CRM | |

**User's choice:** Tema del negocio impersonado.
**Notes:** Implica variante read-only por props para componentes del dashboard que hoy fetchean/mutan solos.

## Base legal / consentimiento (salud)

| Option | Description | Selected |
|--------|-------------|----------|
| Disclaimer + auditoría, revisión formal aparte | Copy en ConfirmDialog + audit; revisión legal formal = acción externa fuera de fase | ✓ |
| Gate de consentimiento registrado | Flag de consentimiento por negocio | |
| Solo auditoría, sin copy legal | Mínimo esfuerzo | |

**User's choice:** Disclaimer + auditoría, revisión formal aparte.
**Notes:** Proporcionado con historia clínica ya excluida. Revisión legal formal antes del primer cliente de salud (deferred).

## PII de clientes finales

| Option | Description | Selected |
|--------|-------------|----------|
| Completos, como los ve el cliente | Nombre/teléfono/email visibles; acceso auditado | ✓ |
| Enmascarados por defecto | Masking parcial salvo revelado explícito | |

**User's choice:** Completos, como los ve el cliente.

---

## Claude's Discretion

- Estructura exacta de archivos/rutas de la sub-página de impersonación.
- Forma de la capa de lectura read-only (helper service-role scoped por business_id) y queries por sección.
- Mapeo de qué componentes del dashboard se reusan tal cual vs. requieren variante read-only.
- Nombre exacto del `action` string en audit_log (sugerido `impersonate`).
- Confirmar que no hace falta migración nueva (audit_log ya existe).

## Deferred Ideas

- Revisión legal formal de impersonación (términos / consentimiento) — acción externa, antes del primer cliente de salud.
- Incluir historia clínica / finanzas en la vista — requiere base legal explícita.
- Gate de consentimiento registrado por negocio — v2 si la revisión legal lo exige.
- Masking de PII de clientes finales — no en v1.
- Atajo desde el directorio + modo impersonación persistente con auto-expiración — descartados en v1.
- Auditoría por pantalla/sección vista — descartada en v1.
