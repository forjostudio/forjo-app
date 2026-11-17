# Phase 4: Los tabs profundos sobre la política ya fijada - Discussion Log

> Registro para revisión humana. Los agentes leen `04-CONTEXT.md`, no este archivo.

**Date:** 2026-11-17
**Phase:** 04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada
**Areas discussed:** Cómo se apilan los tabs, Nombres en la URL, Tocar la sección estando en un tab

---

## Cómo se apilan los tabs

**Pregunta 1:** Datos → Cobros → Integraciones → Cobros: ¿qué hace el atrás?

| Option | Description | Selected |
|--------|-------------|----------|
| Un nivel: siempre a Datos | Salir del default empuja; entre no-default reemplaza; desde cualquier tab el atrás vuelve al default y el siguiente sale según la Phase 3. Ajusta la frase del criterio 1 | ✓ |
| Cada tab | Cada cambio empuja; el atrás recorre todos los tabs visitados (acumula con ida y vuelta) | |
| Sin historial | El tab vive en la URL pero siempre reemplaza; el atrás sale directo (contradice el criterio 1) | |

**Pregunta 2:** Tocar a mano el tab por defecto desde otro tab.

| Option | Description | Selected |
|--------|-------------|----------|
| Consume la entrada | Equivale a un atrás; el próximo atrás sale de la sección (como sección→Inicio en la Phase 3) | ✓ |
| Reemplaza | Deja Datos arriba de Datos: un atrás sin efecto visible (entrada basura) | |

**Notes:** Entrar directo por URL a un tab no fabrica el default debajo (consistencia con la Phase 3, sin preguntar).

---

## Nombres en la URL

**Pregunta 1:** ¿Qué se ve en la URL para cada tab?

| Option | Description | Selected |
|--------|-------------|----------|
| Español, como el label | `?tab=datos/cobros/…/apariencia/…/turnos/ventas/egresos`, con un mapa al valor interno | ✓ |
| Los valores internos tal cual | `?tab=business/appearance/sales…`, URL mitad en inglés | |

**Pregunta 2:** ¿El tab por defecto lleva el parámetro?

| Option | Description | Selected |
|--------|-------------|----------|
| No: /negocio a secas | El default es la URL limpia; los links existentes no cambian | ✓ |
| Sí: siempre ?tab= | Reescribe al entrar; cambia la URL de todos los links | |

---

## Tocar la sección estando en un tab

**User's choice:** el dueño delegó («Voy a elegir tu recomendación en todo, seguí más o menos los criterios que venimos usando»). Se tomó la recomendación: análogo de NAV-08 — tocar la sección activa estando en un tab no-default vuelve al tab por defecto consumiendo la entrada; entrar desde otro lugar abre siempre el default (URL limpia).

---

## Claude's Discretion

- Cómo se expresa la regla en el helper (reusar `panelHistoryAction`/`applyPanelView`/`resolveViewParam` o una función pura nueva), siempre un solo dialecto y testeada en vitest `node`.
- La marca de la entrada del tab y su convivencia con la regla 0, `frjUnder` y el sentinel de salida (marca nueva, nunca reusar la de otro dueño).
- Si `?tab=datos` explícito se sanea a la URL limpia.
- `<Suspense>` + `useSearchParams` vs leer `window.location`.

## Deferred Ideas

Ninguna nueva. Siguen fuera los ítems ya declarados en el ROADMAP.
