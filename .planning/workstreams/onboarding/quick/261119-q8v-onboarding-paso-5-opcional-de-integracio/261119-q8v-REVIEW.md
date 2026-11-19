---
phase: quick-261119-q8v-onboarding-paso-5-opcional-de-integracio
reviewed: 2026-11-19T20:05:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - app/(onboarding)/onboarding/integraciones/integraciones-client.tsx
  - app/(onboarding)/onboarding/integraciones/page.tsx
  - app/(onboarding)/onboarding/page.tsx
  - app/api/google/callback/route.ts
  - app/api/google/connect/route.ts
  - app/api/mercadopago/callback/route.ts
  - app/api/mercadopago/connect/route.ts
  - components/onboarding/onboarding-stepper.tsx
  - lib/oauth-return.ts
  - lib/oauth-return.test.ts
  - lib/onboarding-steps.ts
  - lib/onboarding-steps.test.ts
  - test/oauth-return-routes.test.ts
findings:
  critical: 0
  warning: 3
  info: 8
  total: 11
status: issues_found
---

# Quick 261119-q8v: informe de code review

**Revisado:** 2026-11-19T20:05:00Z
**Profundidad:** standard
**Archivos revisados:** 13
**Estado:** issues_found

## Resumen

Revisé el diff `dee9f5b..HEAD` de los 13 archivos. También leí `lib/panel-tabs.ts` (`vueltaDeOAuthPendiente`), `lib/business-secrets.ts` (`getBusinessIntegrationStatus`), `lib/auth/route-lists.ts`, `lib/supabase/middleware.ts`, el `layout.tsx` del dashboard y el `ResponseCookies.delete` de Next (`node_modules/next/dist/compiled/@edge-runtime/cookies`). Corrí los 3 archivos de test nuevos (62/62 en verde), `test/mp-cobro-callback.test.ts` (2/2) y `tsc --noEmit` (sin errores).

**Seguridad: no encontré BLOCKERs.** Esto quedó verificado:
- **Open redirect:** el `Location` sale sólo de `oauthReturnPath`, un `switch` exhaustivo. El valor crudo, tanto el de la query como el de la cookie, se normaliza con `resolveOAuthReturn`, que usa `Array.find` con igualdad estricta: `__proto__`, `constructor`, `//evil` y `https://…` caen al default. La base sale del entorno, no del request.
- **Valores por defecto:** el panel conserva su comportamiento. MP sin `from` vuelve a `/negocio`, igual que el banner y los botones de `settings-client`. Google sin `from` o con `from=agenda` vuelve a `/agenda`, y `from=negocio` a `/negocio`. MP no acepta `agenda`.
- **`state` anti-CSRF:** la comparación `state === saved` no cambió y sigue corriendo antes de `exchange*Code`. La cookie de destino no participa del chequeo.
- **Tenant:** la page y los dos callbacks resuelven el negocio con `.eq('owner_id', user.id)` de la sesión. `getBusinessIntegrationStatus` recibe ese `business.id` y devuelve booleanos. Al cliente llegan 4 booleanos y la clave del rubro.
- **Cookies:** `mp_oauth_from` y `g_oauth_from` llevan `httpOnly`, `secure` en prod, `sameSite: 'lax'`, `maxAge: 600` y `path: '/'`. `cookies.delete` pone `path: '/'` por default, así que el borrado también pega.
- **Sin sesión:** `/onboarding/*` está en `DASHBOARD_ROUTE_PREFIXES`.

Los problemas que encontré son funcionales y de layout: el stepper de 5 nodos desborda desde `sm`, Finalizar se puede tocar dos veces y la página nueva manda al wizard a un dueño que ya tiene negocio. Además hay huecos de cobertura en los tests y detalles de UX.

## Warnings

### WR-01: el stepper de 5 nodos desborda desde 640px (`sm`), no en mobile

**Archivo:** `components/onboarding/onboarding-stepper.tsx:17,41`
**Problema:** el ajuste de ancho sólo cubre mobile. `connectorWidth` cambia `w-12` por `w-6`, pero el `sm:w-20` queda fijo para cualquier cantidad de pasos. Desde `sm` aparecen las etiquetas (`hidden sm:block`), y cada columna mide lo que mide su etiqueta, no los 36px del nodo. La cuenta con Space Grotesk a 12px da unos 330px de etiquetas («Profesionales» e «Integraciones» rondan 85px cada una) más 4·(80+16) = 384px de conectores, o sea unos 715px. El contenedor útil es de 608px a 640px de viewport y de 672px (`max-w-2xl`) desde 704px. Con 4 pasos daba unos 530px y entraba. Las palabras sueltas no cortan línea y el conector tiene ancho definido, así que el min-content de cada paso no baja lo suficiente. Con `justify-center` el contenido se sale por los dos lados: entre 640 y ~720px el nodo 1 queda cortado contra el borde izquierdo y no se puede scrollear, y en desktop el stepper queda más ancho que la card. El SUMMARY (punto 5) sólo calculó 375px. Conviene medirlo con CDP bajo `con-turno` antes de cerrar.
**Arreglo:** escalar también el conector de `sm` cuando hay más de 4 pasos, o dejar que los conectores crezcan dentro del ancho disponible:
```tsx
const connectorWidth = steps.length > 4 ? 'w-6 sm:w-10 md:w-14' : 'w-12 sm:w-20'
// y sacar `sm:w-20` del literal base:
'h-px mx-1 sm:mx-2 mb-4 transition-colors', connectorWidth,
```
Después medir 640, 768 y 1280px con las 5 etiquetas visibles.

### WR-02: «Finalizar» se rehabilita antes de que termine la navegación (doble toque → toast de error después del de éxito)

**Archivo:** `app/(onboarding)/onboarding/page.tsx:598-604`
**Problema:** `router.replace('/onboarding/integraciones')` no espera la navegación, y el `finally { setLoading(false) }` corre enseguida. El botón vuelve a decir «Finalizar» y queda habilitado mientras se renderiza la page nueva, que hace `getUser`, la consulta de `businesses` y la de `business_secrets` con service role. Ese tramo dura más que el viejo push a `/dashboard`. Un segundo toque vuelve a correr `handleFinish`: intenta otro `insert` en `businesses` con el mismo slug, choca con `businesses_slug_key` (23505) y muestra «Error al crear el negocio. Intentá de nuevo.» justo después de «¡Negocio creado con éxito!». Hoy la integridad la salva el índice único del slug, pero el comentario de la línea 595 deja claro que esa es la única red contra un segundo negocio.
**Arreglo:** no soltar `loading` en el camino de éxito:
```ts
      toast.success('¡Negocio creado con éxito!')
      router.replace('/onboarding/integraciones')
      return // loading queda en true hasta que se desmonte el wizard
    } catch (err) {
      toast.error('Error al crear el negocio. Intentá de nuevo.')
      console.error(err)
      setLoading(false)
    }
```
Los `return` tempranos de adentro del `try`, como el del WhatsApp inválido, también tienen que llamar a `setLoading(false)`. Otra opción es dejar el `finally` y poner un `useRef` `finished` que lo saltee.

### WR-03: la página nueva manda al wizard a un dueño que ya tiene negocio cuando `.single()` falla por cualquier motivo

**Archivo:** `app/(onboarding)/onboarding/integraciones/page.tsx:21-26`
**Problema:** `.single()` devuelve `data: null` en tres casos: 0 filas, 2 o más filas (no hay unique en `owner_id`) o un error de red/PostgREST. Los tres terminan en `redirect('/onboarding')`, y el wizard no verifica si el usuario ya tiene negocio. Esta pantalla aparece justo después de crear el negocio y es adonde vuelven los OAuth, así que un error transitorio deja al dueño frente a un wizard vacío y, si lo completa con otro slug, se crea el segundo negocio que T-q8v-06 quiere evitar. Con dos negocios, el `layout` del dashboard también rebota a `/onboarding` y no hay salida. El patrón viene del dashboard, pero esta ruta suma un camino nuevo de vuelta al wizard.
**Arreglo:** separar «no tiene negocio» de «falló la consulta»:
```ts
const { data: business, error } = await supabase
  .from('businesses')
  .select('id, vertical, type, mp_user_id, mp_connection_status')
  .eq('owner_id', user.id)
  .maybeSingle()
if (error) {
  console.error('[onboarding/integraciones] leer negocio falló:', error.message)
  redirect('/dashboard') // o lanzar el error para el error boundary; nunca al wizard
}
if (!business) redirect('/onboarding')
```

## Info

### IN-01: los tests de rutas no prueban el aislamiento por tenant y un caso mide cero

**Archivo:** `test/oauth-return-routes.test.ts:41-59, 174-179`
**Problema:** `fakeSupabase()` acepta cualquier `eq(...)` y devuelve `biz-1` igual. Si un callback dejara de filtrar por `owner_id`, el test seguiría en verde, y el plan cita T-q8v-03 como mitigado sin test. Faltan dos casos más: el callback de MP sin la cookie `mp_oauth_state` (`!saved`) y el de Google con `g_oauth_from` basura (`__proto__`). Además, `?from=agenda` en el connect de Google (lo que manda la Agenda real) daría `agenda` aunque el código ignorara `from`, porque coincide con el fallback. Ese caso no distingue nada.
**Arreglo:** que el mock de `eq` registre sus argumentos y el test exija `('owner_id', 'user-1')`. Sumar los casos sin `mp_oauth_state` y con `g_oauth_from=__proto__`.

### IN-02: mensajes que se contradicen o faltan al volver del OAuth

**Archivo:** `app/(onboarding)/onboarding/integraciones/integraciones-client.tsx:74-89, 116-124`; `page.tsx:39`
**Problema:** (a) Con `?mp=error` y `mpConnected` en true (una reconexión que falla) sale `toast.error` mientras la tarjeta dice «Conectado». (b) Si el callback guarda los secretos pero `tokens.user_id` llega nulo (`mp_user_id = null`), la vuelta `?mp=connected` no muestra ningún aviso y la tarjeta sigue en «Conectar». (c) `getBusinessIntegrationStatus` ignora el `error` de la consulta, así que una falla pinta Google como desconectado.
**Arreglo:** mostrar el error sólo si la tarjeta no está conectada. Para (b), avisar algo neutro («No pudimos confirmar la conexión»).

### IN-03: «Conectando…» queda trabado si se aborta la navegación

**Archivo:** `app/(onboarding)/onboarding/integraciones/integraciones-client.tsx:131-143`
**Problema:** el `pageshow` sólo cubre la restauración desde bfcache. Si el dueño cancela la carga (Esc, stop, sin red) después de `location.assign`, las dos tarjetas quedan deshabilitadas hasta recargar. Hay otro detalle: Chrome no suele guardar en bfcache las páginas `no-store`, así que en Chrome ese handler casi nunca corre. Sí sirve en Safari.
**Arreglo:** opcional. Liberar `connecting` con un timeout, por ejemplo de 10 s, o en `visibilitychange`.

### IN-04: tres botones primarios compiten con el CTA principal

**Archivo:** `app/(onboarding)/onboarding/integraciones/integraciones-client.tsx:81, 86, 210`
**Problema:** el CONTEXT fija «Ir al panel» como CTA principal, pero los dos «Conectar…» usan la misma variante primaria (`Button` default) y la pantalla queda sin jerarquía.
**Arreglo:** `variant="outline"` en los botones de las tarjetas.

### IN-05: el wizard anuncia «5 pasos» aunque el paso 5 no se vaya a mostrar

**Archivo:** `app/(onboarding)/onboarding/page.tsx:726, 733`
**Problema:** el subtítulo y el stepper siempre cuentan Integraciones. Si el entorno no tiene MP ni Google configurados (local o staging), la page redirige directo a `/dashboard` y el quinto paso nunca aparece.
**Arreglo:** aceptable si en prod siempre están las dos. Si no, pasarle al wizard un flag del server.

### IN-06: la ruta no aplica el bloqueo de plan suspendido

**Archivo:** `app/(onboarding)/onboarding/integraciones/page.tsx:16-26`
**Problema:** el `layout` del dashboard manda a `/suspendido` cuando `plan_status === 'suspended'`. Esta ruta, que sigue accesible para siempre (D-04), no lo hace, así que un negocio suspendido puede conectar MP o Google desde acá. No abre una capacidad nueva, porque los endpoints `/api/*/connect` tampoco miran el plan, pero es una inconsistencia.
**Arreglo:** sumar `plan_status` al `select` y el mismo `redirect('/suspendido')`.

### IN-07: `preload` en los dos lockups y `priority` en el wizard

**Archivo:** `app/(onboarding)/onboarding/integraciones/integraciones-client.tsx:156-157`
**Problema:** se precargan las dos variantes del logo aunque sólo se ve una según el tema. Además, la misma cabecera usa `preload` acá y `priority` en el wizard. La doc de Next 16 recomienda `loading="eager"`/`fetchPriority="high"` antes que `preload`.
**Arreglo:** unificar el criterio en las dos pantallas.

### IN-08: el texto del botón «Finalizar» perdió el contexto

**Archivo:** `app/(onboarding)/onboarding/page.tsx:1241`
**Problema:** la regla de microcopy pide verbo más contexto, y «Finalizar» no dice qué pasa al tocarlo: se crea el negocio.
**Arreglo:** por ejemplo «Crear mi negocio».

---

_Revisado: 2026-11-19T20:05:00Z_
_Revisor: Claude (gsd-code-reviewer)_
_Profundidad: standard_
