# Phase 24: El catálogo que el cliente lee — Discussion Log

**Fecha:** 2026-09-22
**Modo:** discuss (default, interactivo)
**Áreas presentadas:** 4 · **Seleccionadas:** 4 (todas)

> Registro para consulta humana (auditoría, retrospectiva). **No lo consumen** los agentes de research, planning ni ejecución — ellos leen `24-CONTEXT.md`.

---

## Antes de preguntar

Se verificó contra el código y el esquema, en vez de asumirlo:

- `public_services` ya expone `category_id`; `public_service_categories` existe como vista acotada con `GRANT SELECT` a `anon`; `public_businesses` ya expone `category_sort_mode` y `service_sort_mode`. → **Cero migraciones, cero lecturas anónimas nuevas**, y no se dispara la herencia de `secure-phase` que el ROADMAP advertía como condicional.
- `groupCatalog()` (Phase 22) ya resuelve agrupado, orden en los dos ejes, "Otros", ids colgados y el caso de cero categorías. La fase **consume**, no reimplementa.
- El wizard vive en `max-w-lg` (512px) — dato que cambió el significado de "horizontal a lo ancho" y que se le comunicó al usuario **antes** de que decidiera.

Dos todos matchearon por keywords y se descartaron sin gastar una pregunta, por estar fuera de dominio (ver "Reviewed Todos" en el CONTEXT).

---

## Área 1 — Cómo se ven los títulos de categoría

**P1: ¿Cómo se ve el título de cada categoría arriba de su grupo?**
Opciones: Título pelado *(recomendada)* · Título con línea divisoria · Título + contador de servicios
**Elegido:** Título pelado

**P2: ¿Cómo se comporta al scrollear en mobile?**
Opciones: Scrollea con el contenido *(recomendada)* · Se pega arriba (sticky) · Vos decidís
**Elegido:** Scrollea con el contenido

**P3: ¿"Otros" se ve igual que una categoría real?**
Opciones: Idéntico *(recomendada)* · Más apagado · Sin título, pegado al final
**Elegido:** Idéntico a cualquier otro

**Cierre:** "Siguiente área"

---

## Área 2 — Qué es "horizontal a lo ancho"

**P1: ¿Dónde van nombre, precio y duración con ese ancho?**
Opciones: Como hoy pero a lo ancho *(recomendada)* · Precio pegado a la derecha del todo · Molde de la tarjeta del panel
**Elegido:** Como hoy, pero a lo ancho

**Intervención entre preguntas:** se midió y se informó que el wizard vive en `max-w-lg`, así que el cambio real es de ~194px a ~432px útiles por tarjeta, no tarjetas cruzando el viewport. Esto reencuadró la pregunta siguiente.

**P2: ¿El paso 1 se queda en `max-w-lg` o se ensancha?**
Opciones: Se queda *(recomendada)* · Se ensancha solo el paso 1 · Se ensancha todo el wizard
**Elegido:** Se queda en `max-w-lg`

**Cierre:** "Siguiente área"

---

## Área 3 — Un catálogo largo

**P1: ¿Algo ayuda a navegar un catálogo con muchas categorías?**
Opciones: Nada, se scrollea *(recomendada)* · Grupos colapsables · Índice de categorías arriba
**Elegido:** Nada

Área cerrada en una sola pregunta; las dos opciones descartadas quedaron como ideas diferidas, no como rechazo.

---

## Área 4 — Grupos con todo apagado

**P1: ¿Qué se ve en una categoría donde ningún servicio se puede reservar?**
Opciones: El título igual, tarjetas apagadas con su motivo *(recomendada)* · Un aviso en el título del grupo · El grupo se manda al final
**Elegido:** El título igual, tarjetas apagadas con su motivo

---

## Cierre

**P: ¿Queda alguna zona gris?**
Opciones: Listo para el CONTEXT · Explorar más zonas grises
**Respuesta:** "Listo para context" **más dos decisiones agregadas de forma espontánea**:

1. *"El orden es el mismo configurado en el panel, alfabético, por precio, personalizado."* → D-09.
2. *"En el preview de web quiero que se vea escalado con el ancho nuevo a como se va a ver originalmente."* → D-13 y D-14.

Sobre la segunda: se verificó que `BookingClient` lleva su propio `max-w-lg`, así que montado en el panel **ya** se renderiza al ancho real y no hace falta escalar nada. Lo que le faltaba al preview era **recibir las categorías** — y eso va más allá del Success Criterion 5 del ROADMAP, que solo garantizaba que no se rompiera si el dato faltaba. Se le comunicó esa distinción antes de escribir el CONTEXT.

---

## Patrón de las decisiones

Las cuatro áreas cayeron del mismo lado, y conviene que quede dicho porque es lo que debería guiar los casos de borde que aparezcan al planificar:

> **Ningún elemento nuevo compite con las tarjetas, y nada esconde un servicio.**

Títulos pelados (no compiten), sin sticky (no ocupan), "Otros" sin degradar (no jerarquiza de menos), sin colapsar ni indexar (no esconde), grupos apagados a la vista con su motivo (no oculta el problema al dueño).

---

*Phase: 24-el-catálogo-que-el-cliente-lee*
*Log escrito: 2026-09-22*
