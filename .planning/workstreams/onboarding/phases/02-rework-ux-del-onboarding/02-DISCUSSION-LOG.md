# Phase 2: Rework UX del onboarding - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-03
**Phase:** 2-Rework UX del onboarding
**Areas discussed:** Set de pasos omitibles, Auto-skip por rubro, Comportamiento del 'Omitir', Representación del paso omitido, Repaso de UX (orden, labels, feedback, precio)

---

## Set de pasos omitibles (ONB-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Solo Negocio obligatorio | Omitibles: Servicios, Profesionales, Horarios. Llega rápido al dashboard, completa después. | ✓ |
| Negocio + Servicios oblig. | Sin servicios no se puede reservar. | |
| Negocio + Servicios + Horarios | Lo mínimo para que el booking funcione; solo Profesionales omitible. | |

**User's choice:** Solo Negocio obligatorio.
**Notes:** No hay data en prod y todo es completable desde el panel → priorizar llegar rápido al dashboard. Relaja la validación bloqueante actual de `canGoNext` en pasos 2 y 3.

---

## Auto-skip por rubro (vertical Canchas)

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-ocultar en canchas | El paso 'Profesionales' no aparece en el vertical canchas (auto-skip). | ✓ |
| Mantener para todos | El paso aparece en todos los rubros; en canchas queda omitible manual. | |
| Ocultar + renombrar | Auto-ocultar en canchas Y renombrar el paso según vertical en el resto. | |

**User's choice:** Auto-ocultar en canchas.
**Notes:** Área agregada por el usuario en free-text ("que se saltee el paso profesionales según rubro, ej. canchas"). Una cancha no es un profesional humano; en canchas el flujo queda con 3 pasos. Se descartó renombrar por vertical (mantener alcance acotado).

---

## Comportamiento del 'Omitir'

| Option | Description | Selected |
|--------|-------------|----------|
| Avanza al siguiente paso | Skip granular; 'Finalizar' solo en el último paso. | ✓ |
| Salta directo a finalizar | 'Omitir' crea el negocio y entra al dashboard (skip-to-end). | |
| Avanza + 'Terminar ya' fijo | Omitir avanza + botón 'Terminar después' siempre visible. | |

**User's choice:** Avanza al siguiente paso.
**Notes:** El usuario recorre el flujo linealmente sin obligación de completar. En canchas el último paso es Horarios.

---

## Representación del paso omitido

| Option | Description | Selected |
|--------|-------------|----------|
| Solo dato vacío | No inserta nada; el panel muestra empty states. Sin flag/columna. | ✓ |
| Flag de pendiente | Marcar en el negocio qué pasos quedaron pendientes (estado nuevo). | |
| Vacío + CTA en panel | Dato vacío + CTA en el empty state apuntando a completar. | |

**User's choice:** Solo dato vacío.
**Notes:** ONB-PROGRESS-01 (indicador de onboarding incompleto) diferido a v2. Los inserts de `handleFinish` ya filtran vacíos.

---

## Repaso de UX — Orden de pasos

| Option | Description | Selected |
|--------|-------------|----------|
| Mantener orden actual | Negocio → Servicios → Profesionales → Horarios. | ✓ |
| Reordenar | Cambiar el orden (subir Horarios, agrupar opcionales, etc.). | |

**User's choice:** Mantener orden actual.

---

## Repaso de UX — Labels en Servicios

| Option | Description | Selected |
|--------|-------------|----------|
| Encabezado de columnas fijo | Header de columnas visible sobre todas las filas (label siempre visible). | ✓ |
| Mantener label en 1ª fila | Patrón actual (label solo en la primera fila). | |

**User's choice:** Encabezado de columnas fijo.
**Notes:** Hoy `{i === 0 && <Label…>}` — cumple ONB-02 (labels siempre visibles).

---

## Repaso de UX — Feedback inmediato

| Option | Description | Selected |
|--------|-------------|----------|
| Sí, inline onBlur | Validar al salir del campo (WhatsApp, precio, etc.) con error inline. | ✓ |
| Validar al avanzar | Mantener validación solo al avanzar/finalizar. | |

**User's choice:** Sí, inline onBlur.
**Notes:** Extiende el criterio de `validateHours` (ya inline) al resto de campos con formato.

---

## Repaso de UX — Validación de precio

| Option | Description | Selected |
|--------|-------------|----------|
| Precio > 0 en filas con nombre | Mantener regla actual solo sobre filas completadas. | |
| Permitir precio 0 | Aceptar precio 0 en filas completadas (servicio gratuito). | ✓ |
| A tu criterio | Decidir según el patrón del panel de Servicios. | |

**User's choice:** Permitir precio 0.
**Notes:** Cambia la regla actual (`canGoNext` exige `price > 0`). Verificar que el insert de `services` y el panel toleren precio 0.

---

## Claude's Discretion

- Copy exacto y ubicación/estilo del botón "Omitir".
- Forma exacta del encabezado de columnas en Servicios (header sticky vs. labels repetidas).
- Mecánica del stepper dinámico en canchas (recalcular índices/total).
- Qué campos con formato reciben validación onBlur y sus mensajes.

## Deferred Ideas

- ONB-PROGRESS-01 (indicador de onboarding incompleto en el panel) → v2.
- Renombrar el paso Profesionales según terminología del vertical → no se toma (fuera de alcance).
- Rediseño visual completo del onboarding → fuera de scope.
