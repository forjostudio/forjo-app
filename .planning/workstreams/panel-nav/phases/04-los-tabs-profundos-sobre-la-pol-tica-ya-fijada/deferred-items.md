# Phase 4 — lo encontrado fuera de alcance

## Deferred Items

- Finanzas desborda en horizontal a 390 px (17-25 px de más)
  status: open
  **Qué:** en un documento que nace en `/finances` con el viewport del teléfono (390×844, `mobile: true`), el
  documento mide 407-415 px de ancho (`document.documentElement.scrollWidth`). Es lo que dejó el viewport
  visual desplazado respecto del de layout en la sonda (`(0,37)` y `(0,55)`).
  **Dónde se midió:** `R-T-finanzas-url-pegada`, plan 04-01, task 2 (`.planning/debug/tabs-en-la-url-medida.md`
  `## (b)`, la línea «el viewport visual no es el de layout»).
  **Por qué no se tocó:** es layout de la pantalla, no routing; la Phase 4 es «cero pixel nuevo». No es causado
  por este plan (el tab en la URL no cambia el ancho del contenido). Candidato a un quick de polish mobile.

- eslint de `finances-client.tsx`: `react-hooks/set-state-in-effect` preexistente
  status: open
  **Qué:** el `useEffect(() => { fetchData() }, [fetchData])` (era la L383 en `85c99ae`) llama a un setState
  adentro del efecto. Estaba antes de la fase y el plan 04-01 no lo toca.

- El aviso de error del OAuth de Google en el login mobile probablemente tampoco se ve
  status: open
  **Qué:** `components/auth/mobile-login-hero.tsx` pide `toast.error('No pudimos entrar con Google…')` en un
  efecto de montaje que lee `?error=oauth`. Es el mismo patrón que el plan 04-02 midió en `/negocio` y `/agenda`
  (cero toasts con el código de antes): sonner sólo publica a los suscriptores de ese momento y el `<Toaster>`
  se suscribe en su propio efecto, montado DESPUÉS de las páginas en `app/layout.tsx`, así que en un documento
  nuevo el toast se pierde sin error.
  **Dónde se midió:** NO se midió en el login; se midió en `R-T-negocio-oauth-mp`, `R-T-negocio-oauth-google-error`
  y `R-T-agenda-google` (`.planning/debug/tabs-en-la-url-medida.md` `## (c)` y `## (d)`).
  **Por qué no se tocó:** fuera del alcance de la fase (es el login, no un tab). Candidato a un quick: medirlo
  primero (puede que el banner del form lo cubra) y, si se pierde, el mismo arreglo (pedirlo en la próxima tarea).

- El `sinComentarios` del molde se come código cuando un comentario de línea nombra `/*`
  status: open
  **Qué:** el descuento de comentarios de `test/panel-history-clients.test.ts` (y el del bloque de Finanzas de
  `test/panel-tabs.test.ts`, que lo copia) saca los de bloque ANTES que los de línea: un comentario de línea con
  `/api/google/*` abre un bloque falso hasta el próximo `*/`. En `settings-client.tsx` se comía 24.933 caracteres.
  **Dónde se midió:** al escribir el caso (i) del plan 04-02 (región vacía). El `describe` nuevo usa
  `sinComentariosFirme` y un caso de honestidad; los dos consumidores viejos no se tocaron.
  **Por qué no se tocó:** son suites de planes anteriores y hoy pasan con regiones no vacías; revisar si alguna
  aserción NEGATIVA suya cae sobre un tramo comido es un quick de tests, no de esta fase.
