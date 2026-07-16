# Phase 4: Recuperar la cuenta (`/auth/callback` + reset) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-16
**Phase:** 4-Recuperar la cuenta (`/auth/callback` + reset)
**Areas discussed:** Entrada y pantallas del reset, Política de confirmación de email (AUTH-06), Después del reset (destino/sesión/links muertos), Redirect URLs y previews de Vercel

---

## Entrada y pantallas del reset

### ¿Cómo pide el dueño el link de recuperación desde el login?

| Option | Description | Selected |
|--------|-------------|----------|
| Página propia /forgot-password | URL propia (linkeable), 1 CTA por pantalla, patrón esperado. Un archivo más | ✓ |
| Dialog inline sobre el login | Menos navegación, reusa el Dialog de shadcn. Sin URL propia; focus trap + Escape en mobile | |
| Expandir el propio login inline | Cero archivos nuevos. Mezcla dos flujos en un componente con estado, sin URL propia | |

**User's choice:** Página propia `/forgot-password` → **D-01**

### ¿Qué ve después de pedir el link?

| Option | Description | Selected |
|--------|-------------|----------|
| Estado "revisá tu mail" en el mismo card | Muestra a qué dirección se mandó + "Volver al login". Sin pantalla nueva | ✓ |
| Toast de éxito y vuelve al login | Menos código. El toast se va a los 4-6s y lo deja sin rastro → reintenta y come el rate limit | |
| Página dedicada /forgot-password/enviado | URL propia. Archivo de más; el email por query string queda en URL/logs/Referer | |

**User's choice:** Estado en el mismo card → **D-02**
**Notes:** La restricción anti-enumeration (mensaje idéntico exista o no la cuenta) se presentó como ya fija — no era parte de la elección.

### ¿Cómo es la pantalla donde setea la contraseña nueva?

| Option | Description | Selected |
|--------|-------------|----------|
| Página propia, un solo campo con toggle ver/ocultar | Menos fricción; el toggle reemplaza al confirmar | |
| Página propia con contraseña + confirmar | Espeja el /register actual (refine de zod). Un campo más de fricción | ✓ |
| Reusar /register en modo reset | Cero archivos nuevos. Componente con dos identidades; arrastra el copy de alta | |

**User's choice:** Contraseña + confirmar → **D-03**
**Notes:** Eligió consistencia con el `/register` existente por sobre la recomendación de menor fricción.

### ¿Dónde va el link "¿Olvidaste tu contraseña?"?

| Option | Description | Selected |
|--------|-------------|----------|
| A la derecha del label "Contraseña" | Donde nace el problema; no compite con el CTA. Touch target con padding | |
| Debajo del botón "Entrar", arriba del registro | Zona de links secundarios agrupada. Dos links secundarios apilados | ✓ |
| Solo después de que falle el login | Login limpio. Esconde la salida al que ya sabe que la olvidó | |

**User's choice:** Debajo de "Entrar" → **D-04**

### ¿Puede pedir otro mail desde el estado "revisá tu mail"?

| Option | Description | Selected |
|--------|-------------|----------|
| Reenviar con cooldown de 60s | Protege la cuota de rate limit de Supabase (local: 2 mails/hora) | ✓ |
| Sin botón: volver al login y rehacer | Cero código de cooldown. Fricción y no protege del rate limit | |
| Reenviar sin cooldown | Lo más simple. Dos clicks nerviosos queman la cuota horaria | |

**User's choice:** Cooldown 60s → **D-05**

### ¿Qué hace el proxy con /forgot-password si ya tiene sesión?

| Option | Description | Selected |
|--------|-------------|----------|
| Lo deja pasar | Es el único camino para cambiar la contraseña (no hay pantalla en el panel) | ✓ |
| Lo rebota a /dashboard, igual que /login | Consistente con login/register, una línea. Deja encerrado al que no la recuerda | |

**User's choice:** Lo deja pasar → **D-06**
**Notes:** De acá salió la idea diferida "pantalla de cambiar contraseña en el panel".

### ¿Qué layout usan /forgot-password y /reset-password?

| Option | Description | Selected |
|--------|-------------|----------|
| El split del login | Recorrido continuo login→olvidé→reset→login. Repite markup o sale un layout compartido | ✓ |
| El card centrado del register | Menos markup; en mobile el panel se oculta igual. En desktop el recorrido salta | |
| Split + unificar /register al split | Cierra la inconsistencia de raíz. **Reabre un fuera-de-scope declarado** | |

**User's choice:** El split del login → **D-07**

### Copy de /forgot-password

| Option | Description | Selected |
|--------|-------------|----------|
| "Recuperá tu cuenta" + "Te mandamos un link para crear una contraseña nueva" | Voseo e imperativo como el login; habla de la cuenta, no de la contraseña | ✓ |
| "¿Olvidaste tu contraseña?" + "Poné tu email y te mandamos un link" | Espeja el link por el que entró. Titula con pregunta ya respondida | |
| "Restablecer contraseña" + "Ingresá tu email" | Neutro. "Restablecer" es palabra de sistema, no del dueño | |

**User's choice:** "Recuperá tu cuenta" → **D-09**

### ¿Qué dice el panel naranja en las pantallas nuevas?

| Option | Description | Selected |
|--------|-------------|----------|
| El mismo headline del login | El panel es identidad de marca; sale un layout compartido | ✓ |
| Headline propio por pantalla | Más cálido en el momento de frustración. Copy a mantener por pantalla | |
| Panel sin headline | Foco total en el form. Deja un vacío raro | |

**User's choice:** Mismo headline → **D-08**
**Notes:** La opción decía "en las 4 pantallas", lo que chocaba con la elección previa de no migrar `/register`. Claude marcó la contradicción (propia) y la resolvió con la pregunta siguiente en vez de asumir.

### ¿Sobre qué pantallas aplica el layout compartido?

| Option | Description | Selected |
|--------|-------------|----------|
| Solo login + forgot + reset | Respeta el fuera-de-scope; la inconsistencia queda como idea diferida | ✓ |
| Las 4, incluido /register | Cierra la inconsistencia. Reabre un fuera-de-scope declarado en REQUIREMENTS | |

**User's choice:** Solo login + forgot + reset → **D-10**

---

## Política de confirmación de email (AUTH-06)

### ¿Confirmar el mail debería ser obligatorio para entrar?

| Option | Description | Selected |
|--------|-------------|----------|
| No: entra derecho al onboarding | Sin fricción. Mail nunca verificado → vector de takeover en Phase 5 | (elegido y luego revertido) |
| Sí: gate real, no entra hasta confirmar | Todo mail verificado; blinda el linking de Phase 5. Mete un mail en el alta | ✓ (final) |
| Averiguar primero qué hay en prod | El research decide. Deja la política de producto en manos del research | |

**User's choice (final):** **Sí — gate real** → **D-11**
**Notes — el giro de la discusión, y el error que lo causó:**
1. El usuario eligió primero "No" (la opción recomendada por Claude).
2. Al preguntar qué nota heredaba la Phase 6, el usuario respondió con una pregunta propia:
   *"¿el mail de confirmación no tiene que existir igual para la gente que no se loguea con google?"*
3. Esa pregunta expuso **un error factual de Claude**: había afirmado que con `enable_confirmations`
   OFF "Supabase igual manda el mail feo". **Es falso** — con el flag OFF no se manda ningún mail de
   confirmación y el usuario queda auto-confirmado. Son la misma perilla: no existe "mail de
   confirmación que no bloquee".
4. Claude corrigió el error explícitamente y reformuló el trade-off real (sin confirmación: MAIL-01 se
   cae del milestone y el mail de los usuarios de contraseña nunca queda verificado → la Phase 5 tendría
   que resolver el linking sin poder confiar en el mail).
5. El usuario revirtió su elección con su propio razonamiento: *"tiene que haber una confirmación para
   que no se creen cuentas con mails random además de mails de otro. Suma la confirmación, no importa
   que sea el feo de supabase, lo corregimos en la siguiente fase."*

### ¿Qué ve el usuario justo después de "Crear cuenta gratis"?

> Pregunta re-hecha: la elección previa (`toast "¡Listo! Vamos a crear tu negocio." → /onboarding`)
> quedó invalidada al invertirse D-11. Claude la marcó como invalidada en vez de dejarla en el registro.

| Option | Description | Selected |
|--------|-------------|----------|
| El card se reemplaza por "revisá tu mail" | Mismo patrón que /forgot-password; muestra a qué dirección se mandó | ✓ |
| Página propia /register/confirmar | URL propia. Archivo de más; el email por query string queda expuesto | |
| toast "Revisá tu mail" y push a /login | Mínimo cambio. Lo deja en un login que todavía no puede usar | |

**User's choice:** Estado en el mismo card → **D-12**

### ¿Dónde cae el link de confirmación del mail?

| Option | Description | Selected |
|--------|-------------|----------|
| Derecho al /onboarding | Usuario recién creado sin negocio; el wizard es lo único que puede hacer | ✓ |
| Al /dashboard y que el guard lo mande | Un solo destino, menos ramas. Suma un salto; hay que verificar el guard | |
| Al /login con toast "cuenta confirmada" | Conservador. Le pide la contraseña que acaba de crear, por nada | |

**User's choice:** /onboarding → **D-13**

### Si prod tiene la confirmación OFF, ¿qué pasa con las cuentas existentes?

| Option | Description | Selected |
|--------|-------------|----------|
| Prender el flag y verificar que no haya nadie colgado | Solo afecta altas nuevas; el research reporta. Sin migración | ✓ |
| Prender + confirmar en masa a los existentes | Más prolijo. Tocar auth.users en prod por un problema que quizás no existe | |
| Respetar lo que haya en prod | Cero riesgo. Invierte la decisión: la define un flag que nadie eligió | |

**User's choice:** Prender y verificar → **D-15**
**Notes:** La pregunta se hizo con la polaridad invertida (asumía OFF→ON tras el giro de D-11); la respuesta se interpretó en el sentido de la decisión final.

### Mail repetido: alguien se registra con un email que ya tiene cuenta

| Option | Description | Selected |
|--------|-------------|----------|
| Respuesta idéntica — el link del login lo cubre | Protege lo que motiva D-11: el registro no puede ser un oráculo. Cero código | ✓ |
| Error explícito "ese email ya tiene cuenta" | Mejor UX para el despistado. Convierte el registro en oráculo de enumeration | |
| Que lo defina el research | Se mira el flag de ofuscación. Es decisión de producto sobre privacidad | |

**User's choice:** Respuesta idéntica → **D-14**

---

## Después del reset: destino, sesión y links muertos

### ¿Dónde cae tras setear la contraseña nueva?

| Option | Description | Selected |
|--------|-------------|----------|
| /dashboard, y el guard lo manda al onboarding si no tiene negocio | Cumple el criterio 2; una sola rama; reusa el guard existente | ✓ |
| Resolver el destino en /reset-password | Cero saltos. Duplica lógica del panel en una pantalla de auth + una query | |
| Al /login con toast "contraseña actualizada" | Estrena la contraseña. Contradice el criterio 2 y tira la sesión | |

**User's choice:** /dashboard + guard → **D-16**
**Notes:** Claude verificó el guard contra el código **después** de la elección, antes de escribir el CONTEXT: `app/(dashboard)/layout.tsx:23` hace `if (!business) redirect('/onboarding')` y cubre todo el panel. La decisión se apoya en algo verificado, no asumido.

### ¿Qué pasa con las otras sesiones abiertas?

| Option | Description | Selected |
|--------|-------------|----------|
| Se cierran todas menos la actual | Único modo de que "recuperar la cuenta" sirva si te la robaron. Hay que volver a entrar en el celu | ✓ |
| No se toca nada | Cero fricción para el olvidadizo. El intruso se queda adentro | |
| Checkbox para que el usuario elija | Le da control. Le pide una decisión de seguridad en el peor momento | |

**User's choice:** Se cierran todas menos la actual → **D-17**

### Link vencido / ya usado / entrada directa a /reset-password

| Option | Description | Selected |
|--------|-------------|----------|
| La misma /forgot-password en estado de error, con el form listo | Error y solución en la misma pantalla. Cero archivos nuevos | ✓ |
| Pantalla dedicada de "link vencido" | Más espacio para explicar. Pantalla que existe solo para mandarte a otra | |
| Rebote a /login con toast de error | Mínimo código. Es el "error opaco" que el criterio 2 prohíbe | |

**User's choice:** /forgot-password en estado de error → **D-18**

### ¿Cuánto vale el link de recuperación?

| Option | Description | Selected |
|--------|-------------|----------|
| 1 hora — el default, no se toca | Estándar; con reenvío en un click alcanza. Una perilla menos que desincronizar | ✓ |
| 24 horas | Cubre al que lo abre a la mañana. Token que abre la cuenta dando vueltas un día | |
| 15 minutos | Ventana mínima. Todo mail demorado llega casi vencido | |

**User's choice:** 1 hora → **D-19**

---

## Redirect URLs y previews de Vercel

### ¿Qué se allowlistea en las Redirect URLs de Supabase?

| Option | Description | Selected |
|--------|-------------|----------|
| Solo prod + local; en preview auth no anda | Postura conservadora en la superficie donde un agujero entrega cuentas. UAT más incómodo | ✓ |
| Wildcard de previews | UAT en el PR sin tocar prod. El glob sobre-matchea → tokens a quien despliegue una preview | |
| Prod + local, y una URL fija a mano cuando haga falta | Capacidad sin glob. Paso manual cada vez, y hay que acordarse de limpiarlo | |

**User's choice:** Solo prod + local → **D-20**
**Notes:** Consecuencia aceptada explícitamente: el UAT de esta fase y de la Phase 5 se hace en local + prod, repitiendo el dolor de reCAPTCHA en el UAT de Phase 14.

### El Supabase local queda con la confirmación apagada — ¿qué hacemos?

| Option | Description | Selected |
|--------|-------------|----------|
| Prender la confirmación también en local | El flag queda versionado en el repo; se puede probar el gate sin tocar prod | ✓ |
| Dejar local sin confirmación | Dev local rápido. El flujo de esta fase no se puede probar donde se desarrolla | |
| Que lo resuelva el research | Evita prometer un UAT local que quizás no corra. Ata la paridad a un detalle de infra | |

**User's choice:** Prender también en local → **D-23**
**Notes:** Queda como flag para el research confirmar que el capturador de mails local ande en el setup de Windows del usuario.

### El kill switch de mantenimiento devolvería 503 a los links del mail

| Option | Description | Selected |
|--------|-------------|----------|
| /auth exento; /forgot y /reset no | El token siempre se canjea; las pantallas que escriben sí cortan | ✓ |
| Eximir todo el flujo | Se puede recuperar durante el mantenimiento. Contradice el propósito del switch | |
| No eximir nada | Cero superficie nueva. Activar mantenimiento quema en silencio los links en vuelo | |

**User's choice:** Solo /auth exento → **D-21**
**Notes:** Trampa encontrada por Claude scouteando `proxy.ts:21`, no estaba en el ROADMAP.

### Las rutas nuevas caerían fuera de KNOWN_PREFIXES del proxy

| Option | Description | Selected |
|--------|-------------|----------|
| Las 3 entran a KNOWN_PREFIXES; /forgot y /reset NO son isAuthRoute | Dos listas distintas, efectos distintos. Preserva D-06 | ✓ |
| Solo /forgot y /reset; /auth se deja pasar | El callback setea sus cookies. Deja una excepción a recordar para siempre | |
| Que lo resuelva el planner | Evita lockear una línea de Edge desde una charla. Ya sabemos la respuesta de isAuthRoute | |

**User's choice:** Las 3 a KNOWN_PREFIXES, sin isAuthRoute → **D-22**
**Notes:** Segunda trampa del proxy encontrada scouteando (`proxy.ts:40-55` + `lib/supabase/middleware.ts:31`).

---

## Claude's Discretion

- **Forma exacta de `/auth/callback`** — `token_hash` + `verifyOtp` vs `code` + `exchangeCodeForSession`
  (PKCE). El usuario la dejó explícitamente a research/discreción al elegir las áreas a discutir, pese a
  que el ROADMAP la marcaba como decisión de fase. Restricción fija: rutea `recovery`/`signup`/`oauth` y
  la Phase 5 lo reusa sin reescribirlo.
- Mecánica de eliminación del token de la URL tras el canje (barra, `Referer`, logs).
- Copy exacto de: estado "revisá tu mail" (D-02/D-12), aviso de link vencido (D-18), cartel de sesiones
  cerradas (D-17), h1/subtítulo de `/reset-password`.
- Forma del layout compartido del route group `(auth)` sin romper el `/register` actual (D-10).
- Mecánica del cooldown de 60s y si se comparte helper entre las dos pantallas que lo usan.
- Validación de la contraseña nueva (mínimo 6 hoy; patrón onBlur de Phase 2 D-08).

## Deferred Ideas

- **Pantalla de "cambiar contraseña" dentro del panel** — hoy no existe; surgió al decidir D-06.
- **Unificar `/register` al layout split** — inconsistencia real, pero rediseño de login/register está
  fuera de scope en REQUIREMENTS.
- **Mail de bienvenida propio por Resend** — surgió al aclarar que el `Confirm signup` de Auth no es un
  mail de bienvenida. Capacidad nueva, no MAIL-01.

### Notas que heredan otras fases

- **Phase 6 (MAIL-01):** con D-11 el mail de confirmación existe y es obligatorio → MAIL-01 mantiene su
  peso. (Con la confirmación apagada se habría caído del milestone por falta de artefacto.)
- **Phase 5 (AUTH-05):** D-11 le da piso verificado al account linking.
- **Phase 5 (UAT):** D-20 aplica también al UAT de Google — planificar local + prod desde el arranque.
- **Phase 5 (callback):** suma `oauth`, no reescribe; verificar que el endurecimiento siga en pie.
