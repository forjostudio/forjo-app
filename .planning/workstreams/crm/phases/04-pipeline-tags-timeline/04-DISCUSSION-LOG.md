# Phase 4: Pipeline, Tags & Timeline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-20
**Phase:** 04-pipeline-tags-timeline
**Areas discussed:** Modelo de datos pipeline, Conversión lead→business, Tags (catálogo y filtro), Timeline (fuente y alcance)

---

## Modelo de datos del pipeline

### Entidad
| Option | Description | Selected |
|--------|-------------|----------|
| Una sola entidad (lead = deal) | Un row por prospecto, business_id nullable al convertir | |
| leads + deals separados (1:N) | Un lead con varias oportunidades/deals | ✓ |

**User's choice:** leads + deals separados (1:N) en el esquema.
**Notes:** La UI arranca simple (un deal por lead, como el mock), sin pantallas de multi-deal todavía. El 1:N es el seguro contra la migración cuando un contacto tenga varios deals (multi-producto: Gestión, Web Builder, agente).

### Etapas
| Option | Description | Selected |
|--------|-------------|----------|
| Fijas en código (las 5 del mock) | Constante Lead/Calificado/Trial/Propuesta/Pago | ✓ (vía forjo-advisor) |
| Configurables por el operador | Tabla de etapas editable | |

**User's choice:** Delegado a forjo-advisor → DECISIÓN: etapas fijas como constante en código, columna `text` con CHECK (no enum nativo).
**Notes:** Razón del advisor: reproduce el mock, evita over-engineering (operador único), y `text`+CHECK deja extensible agregar etapas sin ALTER TYPE.

### Won/Lost
| Option | Description | Selected |
|--------|-------------|----------|
| Estado open/won/lost aparte de la etapa | won al llegar a Pago/convertir, lost manual con motivo | ✓ |
| Solo etapas, sin won/lost | Perdidos se borran/quedan en su columna | |

**User's choice:** Estado open/won/lost aparte de la etapa.

---

## Conversión lead→business

### Disparador
| Option | Description | Selected |
|--------|-------------|----------|
| Auto en signup + manual del operador | Signup matchea lead por email; operador también convierte | ✓ |
| Solo manual del operador | Operador linkea a mano | |
| Solo automático en signup | Sin conversión manual | |

**User's choice:** Auto en signup + manual del operador.

### Matching
| Option | Description | Selected |
|--------|-------------|----------|
| Email normalizado (con fallback manual) | Email del owner = email del lead; si no hay match, lead nuevo ya convertido | ✓ |
| Solo manual (el operador elige el lead) | Nunca matchea automático | |

**User's choice:** Email normalizado (con fallback manual).

---

## Tags (catálogo y filtro)

### Catálogo
| Option | Description | Selected |
|--------|-------------|----------|
| Catálogo global administrable | Tabla tags (texto+color), asignación vía join | ✓ |
| Free-form por entidad | Texto libre, sin catálogo | |

**User's choice:** Catálogo global administrable.

### Alcance
| Option | Description | Selected |
|--------|-------------|----------|
| Sí, un solo catálogo compartido | Mismo catálogo para leads y negocios | ✓ |
| Catálogos separados | Tags de pipeline ≠ tags de negocios | |

**User's choice:** Sí, un solo catálogo compartido.

### Filtro
| Option | Description | Selected |
|--------|-------------|----------|
| OR (cualquiera de los tags) | Suma resultados al togglear chips | ✓ (vía forjo-advisor) |
| AND (deben tener todos) | Más restrictivo | |
| Vos decidís | A criterio del planner | |

**User's choice:** Delegado a forjo-advisor → DECISIÓN: semántica OR.
**Notes:** Razón del advisor: intuitivo en chips toggle, implementación más simple (overlap query), aditivo si luego hace falta AND.

### Rubro
| Option | Description | Selected |
|--------|-------------|----------|
| Rubro autoderivado del vertical | 'rubro: X' sale del type del negocio; resto manual | ✓ |
| Todos manuales | Incluido el rubro | |

**User's choice:** Rubro autoderivado del vertical.

---

## Timeline (fuente y alcance)

### Fuente
| Option | Description | Selected |
|--------|-------------|----------|
| Vista agregada on-the-fly | VIEW SQL con UNION de audit_log+notas+tareas | ✓ (vía forjo-advisor) |
| Tabla materializada timeline_events | Dual-write desde cada fuente | |

**User's choice:** Delegado a forjo-advisor → DECISIÓN: vista agregada on-the-fly (VIEW `crm_timeline`), sin tabla materializada.
**Notes:** Razón del advisor: evita dual-write/drift respecto a audit_log (fuente de verdad de auditoría); volumen bajo (operador único); Phase 6 agrega comms como rama del UNION.

### Notas/Tareas (alcance)
| Option | Description | Selected |
|--------|-------------|----------|
| Notas (crear/editar) + Tareas livianas (crear/completar) | Ambas entidades nuevas | ✓ (vía forjo-advisor) |
| Solo Notas en esta fase | Tareas diferidas | |
| forjo-advisor | Delegar el alcance | |

**User's choice:** Delegado a forjo-advisor → DECISIÓN: crear Notas (crear/editar/borrar) + Tareas livianas (título + due opcional + done), sin asignación/recordatorios/recurrencia.
**Notes:** Razón del advisor: TL-01 nombra tareas y notas como fuentes; alcance liviano cubre requirement + mock sin gold-plating.

### Degradación sin comms
| Option | Description | Selected |
|--------|-------------|----------|
| Mostrar todos los filtros con empty state | Mensajes/Llamadas con "Sin mensajes — llegan con la Bandeja" | ✓ |
| Ocultar Mensajes/Llamadas hasta Phase 6 | Solo filtros con datos | |

**User's choice:** Mostrar todos los filtros con empty state.

---

## Claude's Discretion

- Forma de los schemas Zod, granularidad de errores, estructura de carpetas dentro de `app/(crm)/admin/`.
- Mecánica del drag-and-drop (zero-install / lo ya bundleado preferido; flaggear dependencia nueva).
- Estrategia de paginación del timeline (keyset vs limit/offset sobre la VIEW).

## Deferred Ideas

- Bandeja / comms (WhatsApp + mail) → Phase 6.
- Reportes/gráficos (revenue, MRR, conversión por etapa, ranking) → Phase 5.
- Pantallas de multi-deal por lead → futuro (schema 1:N ya lo soporta).
- Tareas avanzadas (asignación, recordatorios, recurrencia) → fuera de scope.
- Cobro automático de add-ons / canal externo de alertas → v2.
