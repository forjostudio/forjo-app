---
created: 2026-06-23T00:00:00.000Z
title: Scrape IG confiable vía browser-automation (path opcional de la skill)
area: tooling
milestone: web-builder
files:
  - .claude/skills/forjo-web-builder/SKILL.md (paso 3 — SCRAPE)
  - .claude/skills/instagram-a-web/ (engine headless actual)
  - C:/Users/franc/Desktop/Forjo Studio/.claude/skills/browser-automation/SKILL.md (protocolo)
---

## Problem

El engine actual de scraping de la skill `forjo-web-builder` (vía `instagram-a-web`) usa
Chromium-for-Testing con `--enable-automation`, que Instagram detecta como bot y bloquea con
login-wall incluso en perfiles públicos. En la práctica el scrape casi siempre falla y se cae al
fallback manual (D10-02 lo contempla, no es un bug). Verificado en vivo con `@_fm_masajes_`
(2026-06-23): scrape vacío → fallback manual.

## Solution

Sumar a la skill un **path OPCIONAL de "scrape confiable"** vía la skill `browser-automation`
(fuera del repo, en `C:/Users/franc/Desktop/Forjo Studio/.claude/skills/browser-automation`):
- Usar un **Chrome real logueado** en una cuenta de Instagram → IG ve sesión humana, no bloquea.
  - Opción A de browser-automation: perfil Chrome dedicado (`--user-data-dir=.chrome-profile/`),
    login una vez, persiste. Opción C: MCP `--extension` enganchando el Chrome real.
- **Caveats (de la propia skill):** perfil DEDICADO, nunca el personal (regla A3); usar una cuenta
  IG **descartable**, no la personal — IG prohíbe automatización en ToS (E6), riesgo de flag/ban;
  cadencia baja (E4/E5); headed + setup de login. Es más pesado que el flujo cero-config actual.
- Mantener el flujo actual como default (best-effort headless → manual); browser-automation entra
  solo cuando el operador tiene el Chrome dedicado listo. NO sumar Playwright al root del repo
  (queda aislado en instagram-a-web / browser-automation).

Decisión 2026-06-23: DIFERIDO (el fallback manual funciona; el scrape confiable es mejora futura).
