# Phase 5: Entrar con Google — Discussion Log

**Date:** 2026-07-17
**Mode:** discuss (default)

> Registro para referencia humana (auditoría/retrospectiva). NO lo consumen los agentes downstream — eso es el CONTEXT.md.

## Áreas discutidas

El usuario eligió discutir las 3 áreas presentadas.

### 1. Account linking (AUTH-05)
- **Opciones presentadas:** Unificar en una cuenta (recomendada) · Bloquear el cruce.
- **Elegido:** Unificar en una cuenta.
- **Contexto que pesó:** confirm-email ON en prod (H-01) hace que unificar sea seguro — el vector de takeover requiere mail no verificado, que no existe en este setup. → D-01, D-02.

### 2. Botón de Google
- **Opciones presentadas:** login y register (recomendada) · solo login · solo register.
- **Elegido:** login y register.
- **Razón:** Google OAuth es el mismo flujo para alta y login; AUTH-03 pide ambos. → D-03.

### 3. UX del caso borde
- **Opciones presentadas:** Vínculo silencioso (recomendada) · Confirmar el vínculo.
- **Elegido:** Vínculo silencioso.
- **Nota:** se agregó el principio "nunca un error opaco" para el caso en que el cruce no se pueda resolver (AUTH-05 criterio 4). → D-04, D-05.

## Decisiones de Claude (discreción)
- Mecánica de OAuth (scopes, state/PKCE, initiate) → planner con el research.
- Detalle visual del botón (divisor, icono) → design system existente, sin inventar.

## Ideas diferidas
Ninguna. Otros providers (Apple, etc.) no se mencionaron.

## Flag levantado para el research
Verificar (no asumir) la mecánica de linking de Supabase: linking solo con mail verificado, comportamiento en los dos órdenes, qué identidad manda, y si hay que tocar config (`enable_manual_linking`).
