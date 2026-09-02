# Phase 20: Lo que el público ve — Context

**Gathered:** 2026-09-02
**Status:** Ready for planning

<domain>
## Task Boundary

Llevar al **cliente final anónimo** el mapeo franja↔servicio que la Phase 18 modeló y la Phase 19
volvió configurable. Dos superficies, las dos de lectura: el **booking público**
(`app/[slug]/booking-client.tsx`) y la **landing** (`lib/landing/derive.ts`).

**Fuera de alcance:** el onboarding (se movió a la Phase 21) y el límite de cupos por persona (todo
`2026-08-16-una-persona-puede-ocupar-todos-los-cupos-de-una-clase`, que pide fase propia).
</domain>

<decisions>
## Implementation Decisions

### D-01 — La fase se PARTIÓ: público (20) y onboarding (21)

El roadmap ya marcaba la fase original como candidata a partirse por tener tres superficies. Se
partió, y el corte no fue arbitrario: **los requisitos ya venían separados**. AGENDA-07 son los
criterios de booking público; AGENDA-08 es el del onboarding. La landing no estaba en ninguno de los
dos — se agregó como ampliación en el `discuss-phase 18`.

La costura real es el **verbo**: booking y landing **consumen** el mapeo y se lo muestran a un
anónimo; el onboarding lo **declara** durante el alta. Distinto momento, distinto actor, distinto
riesgo. La 20 queda del tamaño de la 19, que salió bien.

### D-02 — El vacío se resuelve en el SELECTOR, no en el calendario

Un servicio que ninguna franja cubre queda **deshabilitado en el selector de servicios**, con el
motivo visible debajo ("Sin horarios disponibles" o equivalente). No se oculta y no se deja avanzar.

**Hay molde propio, en la misma pantalla:** el picker de consultorios ya hace exactamente esto
(`booking-client.tsx`, paso 3 — `disabled={!enabled}` + `{!enabled && <p>Sin horarios
disponibles</p>}`). Reusar ese patrón, no inventar uno.

**Por qué no ocultarlo:** el dueño no se enteraría de que su servicio quedó invisible. Es exactamente
el modo de falla que este milestone viene evitando — un estado mal configurado que se ve igual que
uno correcto (mismo criterio que AGENDA-06 con el chip "cualquiera").

**Por qué no dejarlo avanzar y explicar en el calendario:** hace que el cliente recorra dos pasos
para chocarse con una pared. El requisito pide que el vacío se explique, no que se explique tarde.

### D-03 — La landing NO cambia

`lib/landing/derive.ts` sigue publicando la **unión** de `time_blocks` como "horarios de atención".

"Horarios de atención" significa *cuándo el negocio está abierto*, y la unión de sus franjas sigue
siendo exactamente eso aunque cada franja dé servicios distintos. El booking sigue siendo la fuente
de verdad de **qué** se puede reservar **cuándo**, que es donde el cliente decide de verdad.

Consistente con el D-02 del milestone (el estado neutro es el estado actual): cero cambio, cero
regresión. La landing es superficie de **marketing**, no de reservas, y pedirle el rigor del booking
sería contraproducente.

**Descartado y por qué:** listar por servicio (sección nueva en el renderer, y con muchos servicios
se vuelve una tabla larga en una página que debería vender); ocultar la sección si hay mapeo (le saca
información útil justo a los negocios que más la necesitan); cambiar el rótulo (cosmético).
</decisions>

<specifics>
## Specific Ideas

- El molde del vacío está en `booking-client.tsx`, paso 3, en el picker de consultorios. Copiarlo.
- La regla del comodín **no se reimplementa**: sale de `lib/time-block-services.ts`, la fuente única
  que ya consumen la disponibilidad, el backstop del `create` y el panel de la Phase 19. Son cuatro
  capas ahora; si alguna la interpreta distinto, derivan.
- `lib/landing/derive.ts` **no se toca** en esta fase (D-03). Si al planificar aparece una razón para
  tocarlo, es señal de que el D-03 hay que rediscutirlo, no de que se puede tocar de paso.
</specifics>

<deferred>
## Deferred

- **El onboarding** → Phase 21 (AGENDA-08).
- **Una persona puede ocupar todos los cupos de una clase grupal** → sigue en
  `todos/pending/2026-08-16-...`. Su propio análisis pide **fase propia** y `secure-phase`: son cinco
  decisiones abiertas (qué identifica a una persona, bloqueo vs aviso, setting por negocio, si el
  control vive dentro del RPC atómico, y cómo no romper los abonos). ⚠ Vale saber que hoy, **desde la
  superficie pública anónima, alguien puede vaciar la agenda de un negocio sin costo**; el único
  freno es reCAPTCHA v3, que mide *bot*, no *duplicado*.
- **El gate de modo esquivable moviendo `services.business_id`** → `todos/pending/2026-08-18-...`, con
  el mecanismo ya corregido (el fix es un trigger, NO un `WITH CHECK`).
</deferred>

<canonical_refs>
## Canonical References

- `lib/time-block-services.ts` — la regla del comodín, fuente única.
- `app/[slug]/booking-client.tsx` — la superficie a cambiar; el picker de consultorios es el molde.
- `app/api/booking/availability/route.ts` — ya filtra por servicio desde la Phase 18; el selector
  tiene que ser coherente con lo que ese endpoint responde.
- `.planning/workstreams/motor-reservas/phases/19-el-panel/19-UI-SPEC.md` — el vocabulario visual del
  mapeo (chips, el estado "cualquiera") ya está fijado ahí.
</canonical_refs>
