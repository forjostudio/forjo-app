---
phase: 16-la-web-nace-como-borrador-skill-del-operador
plan: 03
subsystem: landing
tags: [landing, skill, operador, draft, publish, doc]
requires:
  - scripts/setup-landing.ts (--inspect con al_aire/pendiente_de_aprobacion, --publish, gate estricto — 16-02)
  - lib/landing/write.ts (parseLandingConfigForWrite — el gate que la doc ahora nombra)
provides:
  - ".claude/skills/forjo-web-builder/SKILL.md: el flujo del operador alineado al contrato borrador/publicado (D-01..D-06)"
  - "MODO EDICIÓN reconstruye SIEMPRE desde el borrador (pendiente_de_aprobacion), fallback a al_aire solo si es null (D-04)"
  - "checkpoint del paso 6 con destino de escritura + aviso de choque (D-01/D-02) — el único gate humano"
  - "guardrail no-negociable: La web NACE COMO BORRADOR (--publish opt-in, solo con el OK del dueño)"
affects:
  - "el agente operador que ejecuta la skill: deja de publicar por defecto y deja de reconstruir desde lo publicado"
tech-stack:
  added: []
  patterns:
    - "La doc ES el flujo ejecutable: el checkpoint bloqueante vive en el SKILL.md, no en el proceso Node (el script solo imprime)"
key-files:
  created: []
  modified:
    - .claude/skills/forjo-web-builder/SKILL.md
decisions:
  - "El copy del aviso de choque se copió VERBATIM del script (no se reescribió): doc y código dicen exactamente lo mismo, y aparece UNA sola vez en la skill (paso 6) para que no se diluya."
  - "El checkpoint ACOTADO del MODO EDICIÓN (paso 4) también cuelga el aviso de choque y el destino de la escritura. El plan solo pedía el paso 6, pero el modo edición es justo donde el riesgo de pisar al dueño es MÁXIMO (se retoca una web que él ya pudo haber tocado) — T-16-08 por la puerta de atrás."
  - "Cero mención de --from-published (D-04b): si el dueño rompió su borrador, la doc lo manda al botón Descartar de SU editor."
  - "El OUTPUT por defecto NO devuelve URL: /[slug] sigue mostrando la web vieja. Mandarle esa URL al operador como si fuera la web nueva sería mentirle sobre el estado (T-16-09)."
metrics:
  duration: ~20 min
  completed: 2026-07-13
  tasks: 2
  commits: 4
  tests_added: 0
  tests_total: 505 passed / 48 skipped (sin cambios — este plan no toca código)
status: complete
---

# Phase 16 Plan 03: La SKILL.md del operador — Summary

`.claude/skills/forjo-web-builder/SKILL.md` dejó de enseñarle al agente operador tres cosas que después de 16-02 son falsas (que la escritura sobre-escribe lo publicado, que el modo edición parte del config publicado, y que el gate es el validador fail-safe de lectura): ahora documenta el contrato real — la web nace como borrador, el modo edición parte del borrador, y `--publish` es opt-in con el OK del dueño.

## Qué se cambió

### Los 4 puntos del flujo (Task 1)

- **Paso 2 (RESOLVER, read-only).** El `--inspect` ya no vuelca `landing_config`: la doc tiene la tabla de las 5 claves reales (`al_aire` = lo publicado / `pendiente_de_aprobacion` = el borrador / `nunca_publico` / `tiene_cambios_sin_publicar` / `partes_sin_publicar`), con la columna real de la DB detrás de cada una. El renglón que decía que la escritura **sobre-escribe** el config se reemplazó por el contrato nuevo: por defecto **no toca lo publicado**, y si el dueño tiene trabajo sin publicar, **ese dato se lleva al checkpoint del paso 6** (acá no se decide nada).
- **MODO EDICIÓN paso 1 (D-04 — el punto de seguridad del plan).** Regla dura escrita como tal: reconstruir el `BuilderInput`/`brand` **SIEMPRE desde `pendiente_de_aprobacion`**, y caer a `al_aire` **solo si el borrador es `null`**. El POR QUÉ va textual y sin ablandar: el borrador incluye los retoques que el dueño hizo y no publicó; partir de lo publicado los **descartaría en silencio** — la misma pérdida que el aviso de choque evita, pero por la puerta de atrás, donde ningún aviso es posible. **Cero mención de `--from-published`** (D-04b): si el dueño rompió su borrador, lo resuelve con **"Descartar"** en SU editor.
- **Paso 6 (CHECKPOINT BLOQUEANTE).** Dos ítems nuevos colgados del gate que ya existía: **destino de la escritura** (borrador, o borrador + AL AIRE con `--publish`) y el **aviso de choque** con el copy exacto del script (`⚠ El dueño tiene cambios sin publicar. Secciones que difieren de lo publicado: hero, gallery. Si seguís, los pisás.`). Queda escrito que **el checkpoint vive acá y no en el script**: el script solo imprime, cuando el proceso Node arranca la escritura ya está aprobada. El flujo **no aborta**: el operador decide con el dato a la vista, y si no quiere pisar al dueño, para y le escribe por WhatsApp.
- **Paso 7 (ESCRIBIR).** Mismo comando por defecto, contrato distinto: resuelve `business_id` → avisa → re-hostea → arma el config → **GATE estricto `parseLandingConfigForWrite`** (`invalid_config` / `config_too_large`; NO degrada una sección a `{}`) → `UPDATE ... WHERE id = businessId` escribiendo **solo `landing_draft`**. **La web NO sale al aire.** `--publish` va en su propia sub-sección con el comando completo, qué hace (las dos columnas + pre-print de qué web reemplaza / GO-LIVE) y la **regla dura**: solo con el OK explícito del dueño; nunca por defecto, nunca "por las dudas". Avisarle al dueño = **WhatsApp del operador**, no hay nada en código (D-06).

### El frontmatter, la intro, el OUTPUT y los guardrails (Task 2)

- **`description`**: ya no promete "deja la preview viva en su `/[slug]`" ni "devuelve la URL de preview" → deja la web armada **COMO BORRADOR** esperando la aprobación del dueño, y devuelve el estado (borrador escrito, qué partes cambian, si choca con trabajo sin publicar). **Los 5 triggers de activación se conservaron verbatim** (T-16-10: tocarlos rompe la skill y el operador vuelve a escribir configs a mano, sin gate ni checkpoint). Frontmatter sigue siendo YAML válido (`name` + `description`).
- **Intro**: "no hay deploy" sigue siendo cierto, pero ahora entre la escritura y el público hay **una aprobación del dueño**. Queda declarado el circuito **operador → dueño → público**.
- **Paso 8 (OUTPUT)**: bifurcado igual que el cierre del script. Por defecto **no hay URL de preview pública** (resumen + "quedó como borrador" + avisarle al dueño por WhatsApp); con `--publish`, la URL de `/[slug]`. Escrito explícito: **no inventes un link de preview** — el preview compartible está Out of Scope y `/[slug]` sigue mostrando la web vieja.
- **Guardrails**: el de "Escritura SOLO por `setup:landing`" ahora nombra el **gate estricto de escritura**; y se agregó el guardrail nuevo **"La web NACE COMO BORRADOR"** en el mismo tono no-negociable. Los guardrails viejos (secciones fijas, solo componentes Forjo-native, no tocar booking/pagos, `services` auto desde la tabla, nunca campos sensibles, **re-host obligatorio**) quedaron intactos.

## Tareas y commits

| Task | Nombre | Commit |
|------|--------|--------|
| 1 | Los 4 puntos del flujo — paso 2, MODO EDICIÓN, checkpoint y escritura | `97d259a` |
| 2 | Frontmatter, intro, OUTPUT y guardrails | `c8fe62d` |
| 2+ | Coherencia: prerrequisitos + checkpoint acotado del MODO EDICIÓN | `71c3115` |
| 2+ | Nombrar las columnas reales detrás de `al_aire` / `pendiente_de_aprobacion` | `f7e5456` |

## Verificación

```
rg -c "al_aire"                          → 2   (paso 2 + MODO EDICIÓN)
rg -c "pendiente_de_aprobacion"          → 2   (paso 2 + MODO EDICIÓN)
rg -c "tiene_cambios_sin_publicar"       → 4   (paso 2 ×2 + checkpoint acotado + paso 6)
rg -c -- "--publish"                     → 6   (comando + regla de uso + checkpoint + OUTPUT + guardrail)
rg -c "parseLandingConfigForWrite"       → 2   (paso 7 + guardrail)
rg -c "from-published"                   → 0   (D-04b: descartado, no se documenta)
rg -c "El dueño tiene cambios sin publicar" → 1 (copy idéntico al del script, una sola vez)
rg -c "NACE COMO BORRADOR"               → 1   (el guardrail nuevo)
rg -c "borrador"                         → 16
rg -c "^name: forjo-web-builder"         → 1   (frontmatter YAML válido: keys name + description)
rg -c "armale la web a" / "generar landing para" / "personalizar la web de un negocio" / "hacele una" / "convertir el Instagram de" → 1 c/u (triggers intactos)
rg -c "Re-host OBLIGATORIO"              → 1   (guardrails viejos en pie)

git diff --name-only (4 commits)         → SOLO .claude/skills/forjo-web-builder/SKILL.md
```

Cero código, cero deps, cero migraciones. **Coherencia doc ↔ script:** las 5 claves del `--inspect`, el copy del aviso y el comando `--publish` se copiaron de `scripts/setup-landing.ts` tal cual quedó tras 16-02.

**Pendiente de operador (UAT de fin de fase, `/gsd:verify-work 16`):** correr la skill punta a punta sobre un negocio real y confirmar que el agente (a) muestra el aviso de choque cuando corresponde, (b) NO publica por defecto, (c) en MODO EDICIÓN parte del borrador.

## Deviations from Plan

### 1. [Rule 2 — funcionalidad crítica faltante] El checkpoint ACOTADO del MODO EDICIÓN también lleva el aviso de choque

El plan pedía colgar el aviso del **paso 6**. El MODO EDICIÓN tiene su **propio** checkpoint acotado (paso 4), que solo remitía al "mismo ethos bloqueante del paso 6" — así que un retoque no habría mostrado nunca el aviso. Y el modo edición es exactamente donde el riesgo de pisar al dueño es **máximo**: se está retocando una web que él ya pudo haber tocado. Se le sumaron los mismos dos ítems (destino de la escritura + aviso de choque). Es T-16-08 tapado por la puerta de atrás.

- **Commit:** `71c3115`

### 2. [Rule 2] Prerrequisitos decían "vos solo armás el `landing_config`"

Renglón fuera de los 4 puntos del plan, pero contradecía el contrato nuevo (el operador NO escribe `landing_config` por defecto). Reformulado a "el **config del landing**, que por defecto se escribe en el **borrador** (`businesses.landing_draft`)".

- **Commit:** `71c3115`

### 3. [Coherencia] Las columnas reales nombradas en la tabla del paso 2

Tras las ediciones, la string `landing_config` había desaparecido del archivo: la tabla del `--inspect` decía "LO PUBLICADO" sin nombrar la columna. Se agregó `(columna landing_config)` / `(columna landing_draft)` para que el operador pueda mapear el JSON del script a la DB.

- **Commit:** `f7e5456`

## Threat Mitigations (del `<threat_model>` del plan)

| Threat | Estado | Cómo |
|--------|--------|------|
| T-16-02b (reconstruir desde la columna equivocada) | mitigado | MODO EDICIÓN paso 1: "**SIEMPRE desde `pendiente_de_aprobacion`**, fallback a `al_aire` solo si es `null`", con el POR QUÉ escrito sin ablandar. |
| T-16-08 (checkpoint degradado) | mitigado | Paso 6 **y** checkpoint acotado del MODO EDICIÓN llevan el aviso con el copy exacto del script + queda escrito que el gate humano vive en la doc, no en el proceso Node. |
| T-16-04b (operador → producción) | mitigado | `--publish` en sub-sección propia con la regla dura ("solo con el OK explícito del dueño"), repetida en el guardrail no-negociable "La web NACE COMO BORRADOR". |
| T-16-09 (falsa expectativa de publicación) | mitigado | `description` + intro + OUTPUT bifurcado: por defecto **no hay URL de preview**; explícito que `/[slug]` sigue mostrando la web vieja. |
| T-16-10 (skill rota por tocar los triggers) | mitigado | Los 5 triggers del `description` se conservaron verbatim (grep de cada uno = 1); frontmatter YAML válido. |
| T-16-11 (information disclosure) | mitigado | Guardrails de "NUNCA campos sensibles" y "Re-host OBLIGATORIO de imágenes" intactos (no se tocaron). |
| T-16-SC (supply chain) | mitigado | Cero código, cero `npm install`. `git diff --name-only` de los 4 commits = un solo archivo markdown. |

## Threat Flags

Ninguno. Edición de markdown: sin endpoints, sin rutas de auth, sin acceso a archivos, sin cambios de schema.

## Known Stubs

Ninguno.

## Self-Check: PASSED

- `.claude/skills/forjo-web-builder/SKILL.md` — FOUND (modificado; único archivo del plan)
- Commits `97d259a`, `c8fe62d`, `71c3115`, `f7e5456` — FOUND en `git log`
- Cero archivos borrados en los 4 commits
</content>
