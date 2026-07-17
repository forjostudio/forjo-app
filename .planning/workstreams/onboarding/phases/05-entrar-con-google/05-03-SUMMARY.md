---
phase: 05-entrar-con-google
plan: 03
subsystem: auth
tags: [google-oauth, supabase, account-linking, checkpoint, uat]

requires:
  - phase: 05-01
    provides: "la rama code→exchangeCodeForSession + DESTINATIONS.oauth + /login?error=oauth"
  - phase: 05-02
    provides: "el GoogleButton en login/register + el aviso ?error=oauth"
provides:
  - "Provider Google habilitado en el Dashboard de Supabase (prod) + redirect URI en las credenciales OAuth existentes"
  - "UAT prod-first verificado: AUTH-03/04/05 + el cross-test de account linking en los dos órdenes"
affects: [phase-06-mails-branded]

tech-stack:
  added: []
  patterns:
    - "Config externa de OAuth (Google Cloud + Dashboard Supabase) como checkpoint humano; el client secret nunca en git"

key-files:
  created: []
  modified: []

key-decisions:
  - "Se reusaron las credenciales OAuth existentes (las de Calendar) — no hizo falta crear un client nuevo (A2 no disparó)."
  - "AUTH-05 Orden 2 (Google→contraseña) se acepta con el comportamiento de anti-enumeration (T-05-09): 'revisá tu mail' sin mail, sin cuenta duplicada. Es el mismo code path de D-14 (Phase 4)."

patterns-established: []

requirements-completed: [AUTH-03, AUTH-04, AUTH-05]

duration: checkpoint humano + UAT prod-first interactivo
completed: 2026-07-17
status: complete
---

# Phase 5 · Plan 03: Checkpoint humano + UAT prod-first Summary

**Google OAuth quedó habilitado en prod y verificado end-to-end: alta y login con Google funcionan, y el account linking (la trampa del milestone) resuelve a una sola cuenta en los dos órdenes.**

## Task 1 — Checkpoint humano (config externa)

Ejecutado por el dueño. Reportes que el checkpoint pedía:

- **(a) Credenciales:** se **reusaron las credenciales OAuth existentes** (las que ya usa Google Calendar, `client_secret_*.json`). No hizo falta crear un client nuevo — A2 (el fallback por consent/scopes) **no disparó**.
- **(b) Redirect URLs:** exactamente **2 entradas**, **ninguna con wildcard** (D-06 cumplido, verificado en captura):
  - `https://gestion.forjo.studio/auth/callback`
  - `http://127.0.0.1:3000/auth/callback`
  - Site URL = `https://gestion.forjo.studio` (correcto, de Phase 4).
- **(c) Confirm email:** sigue **ON** en prod — verificado indirectamente pero de forma sólida: el linking automático de Orden 1 funcionó, y GoTrue solo auto-vincula si el email está verificado (T-05-01/H-01). Si estuviera OFF, Orden 1 no habría caído en la cuenta existente.

Config aplicada: provider Google habilitado en el Dashboard con client ID/secret; redirect URI `https://tpvbjwqzskzkevepcwyb.supabase.co/auth/v1/callback` en las credenciales OAuth.

## Task 2 — UAT prod-first (en gestion.forjo.studio, cuentas de Google descartables)

| Bloque | Criterio | Resultado |
|---|---|---|
| A | AUTH-03 — alta con Google sin inventar contraseña | ✓ Entra autenticado y cae en `/onboarding` (usuario nuevo sin negocio) |
| A+B | AUTH-04 — nuevo→onboarding, recurrente→panel, sin duplicar | ✓ La 2da vez con la misma cuenta entra directo al dashboard (login, no alta) |
| C orden 1 | AUTH-05 — contraseña→Google → una cuenta | ✓ Cae en la cuenta existente, negocio intacto, silencioso (D-04) |
| C orden 2 | AUTH-05 — Google→contraseña | ✓ **anti-enumeration** (ver abajo): "revisá tu mail" sin mail, **sin cuenta duplicada** |
| D | D-05/D-08 — cancelación/fallo de Google | ✓ Cae en `/login` con "No pudimos entrar con Google…", sin pantalla muerta |

**AUTH-05 Orden 2 — comportamiento y por qué es un pass.** Registrar con contraseña un email que ya existe como cuenta de Google muestra el "revisá tu mail" genérico y **no manda mail** — a propósito. Es el mismo code path que la Phase 4 estableció y verificó (email existente + confirm-email ON → GoTrue devuelve `user_already_exists` → sin mail; la UI lo trata igual que un alta nueva, D-14). No se crea una cuenta duplicada, que es lo que AUTH-05 exige. El costo asumido (documentado como riesgo aceptado **T-05-09**): un usuario que entró por Google no puede "agregarse" una contraseña desde `/register` — necesitaría un flujo aparte de "definir contraseña" desde su cuenta, fuera del scope de este milestone. Decirle "ya tenés cuenta con Google" reintroduciría el oráculo de enumeration que D-14/D-02 cierran.

## Hallazgo fuera de scope

**Onboarding es un callejón sin salida.** Al elegir la cuenta de Google, el usuario nuevo cae directo en `/onboarding` y **no puede salir sin crear el negocio** — si elige la cuenta equivocada, queda atrapado. NO es un bug de Phase 5: le pasa a cualquier usuario autenticado sin negocio (Google o email/contraseña), es cómo funciona el onboarding hoy. Mismo síntoma que se marcó en el UAT de Phase 4. Pertenece al milestone de onboarding — sumar "poder salir / cambiar de cuenta desde onboarding" a ese laburo. Relacionado con el bug ya anotado `onboarding-slug-collision-rls`.

## Pendiente

- **Secure-phase:** correr `/gsd:secure-phase 5 --ws onboarding` al cierre (threat model T-05-01…09).
- El código de la fase (Wave 1) ya está en prod (deploy tras el push a `main`, commit ab2744a).

## Notas para Phase 6

- Los mails que Phase 6 va a brandear ahora incluyen el de confirmación que dispara el alta por Google (primera vez). El flujo de OAuth no manda mails propios (el consent lo maneja Google), así que Phase 6 sigue enfocada en confirmación + recuperación.
