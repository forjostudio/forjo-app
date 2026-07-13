# Phase 16: La web nace como borrador (skill del operador) — Discussion Log

**Date:** 2026-07-13
**Mode:** discuss (default)
**Áreas presentadas:** 4 · **Áreas discutidas:** 4 (las 4)

> Registro humano de la conversación. **No lo consumen los agentes downstream** — para eso está
> `16-CONTEXT.md`.

---

## Contexto que ya estaba decidido (no se re-preguntó)

- `landing_config` = lo publicado · `landing_draft` = lo que se edita. `/[slug]` lee solo lo
  publicado. (v0.18, LOCKED)
- El script del operador sigue siendo **local, service-role, fuera del runtime web**, con checkpoint
  humano pre-escritura. No se abre superficie web nueva. (v0.10, LOCKED)
- Go-live implícito: publicar por primera vez = salir al aire. Sin columna `web_live`. (v0.18, LOCKED)

**Hallazgo del scout que enmarcó toda la discusión:** el script hace `UPDATE` de overwrite total. Eso
era seguro porque era el **único escritor** del landing. Esta fase lo desvía al borrador — y al
hacerlo crea algo que hasta ahora no existía: **dos escritores sobre la misma columna**.

---

## Área 1 — Choque operador ↔ dueño sobre el borrador

**Por qué se presentó:** si el dueño tiene cambios sin publicar y el operador corre la skill, el
overwrite total se los pisa **en silencio**. Es la misma clase de bug que CR-01 (la pérdida de datos
que el code review encontró en la Phase 15), con los roles invertidos.

**Los 4 escenarios que se pusieron sobre la mesa:**

| Estado del negocio | Qué pasaba |
|---|---|
| Nunca publicó, borrador vacío | Limpio (caso de alta) |
| Nunca publicó, el dueño ya toqueteó | Le pisa lo que hizo |
| Publicado, borrador == publicado | Limpio |
| Publicado, el dueño tiene cambios sin publicar | Le pisa cambios que iba a publicar |

### Pregunta 1 — ¿Qué hace el script?

| Opción | Elegida |
|---|---|
| **Avisa en el checkpoint y el operador decide** (recomendada) | ✅ |
| Aborta salvo `--force` | |
| Pisa siempre, sin chequear (lo que hace hoy) | |

**Notas:** detectarlo es gratis — la Phase 15 dejó `configsEqual` (compare canónico, inmune al
reordenamiento de claves del `jsonb`), y el checkpoint humano pre-escritura **ya existe** en el
SKILL.md. El aviso se cuelga de un gate que ya está; no se inventa uno nuevo. El caso limpio (95%) no
paga fricción. → **D-01**

### Pregunta 2 — ¿Qué muestra el aviso?

| Opción | Elegida |
|---|---|
| **Qué secciones difieren** (recomendada) | ✅ |
| Solo el aviso, sin detalle | |
| Diff completo campo por campo | |

**Notas:** `configsEqual` se aplica por sección, así que el "qué secciones difieren" es casi gratis.
El diff campo-por-campo se descartó: hay que escribir y mantener un diff-er de JSON, y en la práctica
se decide con el nombre de la sección. → **D-02**

---

## Área 2 — ¿El operador puede publicar directo?

**La tensión, planteada explícitamente antes de la pregunta:** el milestone existe para que nada salga
al aire sin la aprobación del dueño; un `--publish` reabre un camino del operador a producción. Pero
la web es un servicio con el operador adentro, y el caso real es el dueño que pide "hacémela y
subila" por WhatsApp y nunca entra al panel.

**El encuadre que destrabó la decisión:** la línea no es *si* el operador puede publicar — es si
publica **por defecto** (el bug que el milestone mata) o **porque lo eligió explícitamente** (decisión
humana, con el dueño de acuerdo).

| Opción | Elegida |
|---|---|
| **Sí, con `--publish` explícito** (recomendada) | ✅ |
| No. Publicar es SIEMPRE del dueño | |
| `--publish` solo si nunca publicó | |

**Notas:** por defecto solo borrador (SC1 se cumple). Con el flag, además publica, imprimiendo qué web
está por reemplazar. → **D-03** / **D-03b**

---

## Área 3 — De qué columna parte el modo edición

**Encuadre:** `--inspect` vuelca las dos columnas — eso lo pide SKILL-08 literal, no había nada que
decidir. Lo que sí había que decidir es de cuál parte el **modo edición** de la skill (Phase 11), que
reconstruye el payload desde el dump. Y no es una preferencia: partir de lo publicado **descarta en
silencio** los cambios sin publicar del dueño al re-escribir.

| Opción | Elegida |
|---|---|
| **Del borrador, siempre** (recomendada) | ✅ |
| Del borrador, con `--from-published` para el caso raro | |
| De lo publicado | |

**Notas:** el borrador es "lo último que se tocó" e incluye los retoques del dueño. Fallback a lo
publicado si no hay borrador (negocio legacy). Coherente con D-01: lo único que pisa el trabajo del
dueño es una decisión avisada del operador, nunca un default silencioso. El `--from-published` se
descartó (superficie de CLI para un caso que puede no aparecer nunca; y el dueño ya tiene "Descartar"
en su editor). → **D-04** / **D-04b**

---

## Área 4 — Cómo se entera el dueño

**Guardián del alcance:** se le dijo al usuario, derecho, que avisarle al dueño es una **capacidad
nueva**, no una aclaración de la fase. SC2 no pide notificación. Y hoy un mail apuntaría a una puerta
que no existe: el editor sigue detrás de `CMS_ENABLED` y su entrada al panel recién aparece en la
Phase 17.

| Opción | Elegida |
|---|---|
| **Nada en código — se lo dice el operador** (recomendada) | ✅ |
| Diferirlo, pero atarlo a la Phase 17 | |
| Meterlo ahora (mail con Resend) | |

**Notas:** el aviso ya existe y es de carne y hueso (WhatsApp). La web a medida es un servicio con el
operador adentro, no un self-service. → **D-06**, y a Deferred Ideas.

---

## Claude's Discretion (no se preguntó — decisiones técnicas)

Se dejaron escritas en el CONTEXT para que el planner no las redescubra:

1. **El script debe validar con `parseLandingConfigForWrite`** (estricto), no con `parseLandingConfig`
   (fail-safe de lectura). Hoy usa el segundo: un `data` inválido degrada la sección a `{}` **en
   silencio** y el operador no se entera. Quedó anotado al cerrar la Phase 15; ésta es la fase que
   toca ese archivo.
2. **Revertir el fix CR-01** (`f98ed6b`): hoy el script escribe las dos columnas. Pasa a escribir solo
   `landing_draft`, salvo con `--publish`. El comentario que dejó ese commit explica un incidente
   real — hay que **reemplazarlo, no borrarlo**.
3. **Actualizar el SKILL.md** de `forjo-web-builder`: documenta que la escritura sobre-escribe
   `landing_config` y que el modo edición parte de él.

---

## Deferred Ideas

- Avisarle al dueño que su web está lista (mail/badge) → re-evaluar en la **Phase 17**, o cuando el
  auto-armado con el pago del add-on lo haga necesario de verdad (ahí ya no hay operador que avise).
- Flag `--from-published` para el modo edición.
- Diff completo campo-por-campo en el aviso de choque.

---

*Phase: 16-la-web-nace-como-borrador-skill-del-operador*
