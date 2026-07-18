# Phase 8: Auth siempre con tema Forjo — Discussion Log

**Date:** 2026-07-17 · **Mode:** discuss

## Mecánica del bug (scouteada)
Tema Forjo = default del root (`data-palette="red"`, sin theme/font). `PaletteScript` lo pisa con la paleta del negocio en dashboard/CRM/[slug]. Al cerrar sesión con nav client-side, los atributos quedan pegados en `<html>` y auth los hereda (en load full SSR sale bien).

## Área discutida: dónde resetear
- Opciones: layout de (auth) (recomendada) · flujo de logout.
- Elegido: **layout de (auth)** — cubre todos los caminos (logout, sesión vencida, URL directa), SSR + client-nav. → D-01.

## Confirmado sin discutir
- Respeta claro/oscuro (next-themes intacto), solo resetea la paleta. → D-03.
- Acotado a (auth) → dashboard y /[slug] no se regresionan. → D-04.

## Flags para research
Confirmar si (auth)/layout.tsx existe o hay que crearlo; que cubra login/forgot/reset (en split) + register (fuera del split); reset antes del paint (anti-flash como PaletteScript).
