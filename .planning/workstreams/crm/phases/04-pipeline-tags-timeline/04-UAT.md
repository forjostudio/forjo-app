---
status: diagnosed
phase: 04-pipeline-tags-timeline
source: [04-01-SUMMARY.md, 04-02-SUMMARY.md, 04-03-SUMMARY.md, 04-06-SUMMARY.md, 04-07-SUMMARY.md, 04-08-SUMMARY.md]
started: 2026-06-22T12:01:02Z
updated: 2026-06-22T20:07:31Z
---

## Current Test

[testing complete — re-test 2 (04-08) 2026-06-22: test 7 core cerrado pero NUEVO issue (quitar tags del pipeline); tests 13 (auto-asignar) y 14 (limpiar filtros) cerrados]

## Tests

### 1. Cold Start Smoke Test
expected: Levantar la app desde cero. El server arranca sin errores, la migración 034 está aplicada, y /admin/pipeline carga sin error 500 ni pantalla en blanco.
result: pass

### 2. Acceder al tablero Pipeline
expected: En el sidebar del CRM, "Pipeline" ya no dice PRONTO y lleva a /admin/pipeline. El tablero muestra 5 columnas (Lead, Calificado, Trial, Propuesta, Pago).
result: pass

### 3. Resumen $ y totales por columna
expected: El header muestra el resumen "$ abiertos · $ ganados" y cada columna muestra su total $ propio según los deals que contiene.
result: pass

### 4. Crear nuevo deal
expected: El botón "+ Nuevo deal" abre un diálogo. Al completar contacto/valor/etapa y confirmar, la tarjeta aparece en la columna elegida.
result: pass
note: "Re-test 2026-06-22 tras fix 04-06 (sync optimista) + 04-07/CR-WR (no reusar leads perdidos/convertidos, nombre del form). Refresco inmediato OK y nombre correcto OK. Cierra gaps 4a y 4b."

### 5. Mover deal entre etapas (drag & drop)
expected: Arrastrar una tarjeta a otra columna la mueve ahí de inmediato (optimista). Si la acción del servidor falla, la tarjeta vuelve a su columna original y aparece un toast de error.
result: pass
note: "Re-test 2026-06-22 tras fix 04-06 (acción explícita markWon + wonTotal server-side). Verificado por screenshot: header '$ 0 abiertos · $ 1.095.000 ganados'. Gap cerrado. OBSERVACIÓN fuera de scope: no hay vista del detalle de deals ganados/perdidos (board solo muestra open) → futuro Reportes."

### 6. Marcar deal como perdido
expected: "Marcar perdido" abre un ConfirmDialog que exige un motivo. Al confirmar, la tarjeta sale del tablero (status pasa a perdido).
result: pass
note: "Funciona; queda registro en auditoría. Usuario pregunta si existe una sección de 'perdidos' — no la hay en esta fase (board solo muestra open); posible feature futuro, fuera de scope Phase 4."

### 7. Asignar tags a una tarjeta del pipeline y filtrar
expected: Cada tarjeta tiene "+ Tag" que abre un diálogo para asignar una tag existente o crear una nueva (auto-asignada); la tarjeta muestra el chip y el filtro OR la matchea.
result: issue
reported: "Me está faltando algo a resolver acá: modificar tags asignadas. Otra cosa: agregué la tag pendiente y me aparecían las existentes Holaaa y Hola en el modal. La cree, se asignó pendiente, y ahora al crear una nueva no aparece ninguna existente"
severity: major
note: "Re-test 2 (04-08). RESUELTO el core del gap 7: la tarjeta asigna tags (entity_type='lead'), auto-crea+asigna en un paso, los chips aparecen y el filtro OR matchea (verificado por screenshot: Ferreteria con Holaaa/Hola/Pendiente). De paso confirma el gap minor de auto-asignar (test 13). NUEVO ISSUE: el TagManagerDialog solo asigna/crea, NO quita/modifica tags ya asignadas; y como la ficha solo gestiona tags de business, un lead/deal no tiene NINGÚN lugar para quitar una tag → tag mal puesta queda permanente. El 'No hay tags disponibles' es consecuencia (availableTags = catálogo − asignadas; con las 3 ya asignadas queda vacío). Minor relacionado: copy confuso cuando availableTags está vacío."

### 8. Conversión automática lead→negocio en onboarding
expected: Al terminar el onboarding (crear un negocio nuevo cuyo email coincide con un lead existente), ese lead queda vinculado/convertido al negocio. Si la conversión falla, el onboarding igual termina y redirige al dashboard sin romperse.
result: pass
note: "Funcionó: el deal salió del pipeline y el negocio quedó en /admin/negocios. Auditoría registró 'Convirtió lead' (riesgo medio). Durante esta prueba surgió un bug aparte de createDeal — ver gap test 4b."

### 9. Tab Timeline real en la ficha del negocio
expected: En la ficha de un negocio (/admin/negocios/[id]), la pestaña Timeline ya no dice PRONTO: muestra eventos reales (cambios de auditoría, notas, tareas) con icono por tipo, badge de actor (OPERADOR/CLIENTE/IA/SISTEMA) y fecha relativa.
result: pass

### 10. Agregar nota en el timeline
expected: El input "+Nota" permite escribir y guardar una nota; aparece en el timeline como entrada tipo nota.
result: pass

### 11. Agregar y completar tarea
expected: Se puede crear una tarea desde la ficha; al marcarla como completada queda registrada como completada (y aparece el evento en el timeline).
result: pass
note: "Re-test 2026-06-22 tras fix 04-07 (checkbox de completar + lectura de tasks con id) + migración 035 (des-dup VIEW). Verificado por screenshot: tarea 'Limpar DB' con checkbox tachada como completada, evento 'Tarea completada' una sola vez, sin duplicados (nota/tarea/cambio). Cierra gaps de completar y de duplicado. ENHANCEMENT FUTURO fuera de scope: poder eliminar las tareas completadas de la lista TAREAS manteniendo el evento en el timeline."

### 12. Borrar nota (con confirmación)
expected: Borrar una nota pasa por un ConfirmDialog; al confirmar, la nota desaparece de la lista.
result: pass
note: "Re-test 2026-06-22 tras fix 04-07 (badge al lado del título, pr-8). Cosmético cerrado: el badge 'Medio' ahora va junto a 'Borrar nota', no debajo de la X."

### 13. Asignar y quitar tags en el Resumen de la ficha
expected: En el Resumen de la ficha, la fila de tags "+Tag" permite asignar una tag al negocio y quitarla; el cambio se refleja en los chips.
result: pass
note: "Re-test 2 (04-08) 2026-06-22: papercut (1) auto-asignar CERRADO — confirmado en test 7 ('creé Pendiente, se asignó sola'); createTag→id encadena assignTag en el diálogo compartido. Papercut (2) 'No hay tags disponibles' cuando todas están asignadas: sigue presente y ahora se diagnostica junto al issue de quitar tags del pipeline (test 7 — sin surface de remove, el diálogo queda 'create-only')."

### 14. Filtrar el directorio de negocios por tag
expected: En /admin/negocios, la fila de chips de tags filtra la lista por tag (OR), combinándose con el filtro de tab/búsqueda. "Limpiar filtros" resetea las tags seleccionadas.
result: pass
note: "Re-test 2 (04-08) 2026-06-22: confirmado por el usuario ('ok'). 'Limpiar filtros' ahora aparece con filtro activo y resultados visibles (hasActiveFilters), no solo en el empty-state. Gap minor cerrado. (Round previo: filtro OR del directorio ya funcionaba.)"

### 15. Filtros del timeline (Mensajes/Llamadas)
expected: Los chips de filtro del timeline funcionan; Mensajes y Llamadas muestran un empty state intencional con banner "Ir a Bandeja" (la fuente de datos llega en una fase posterior).
result: pass

## Summary

total: 15
passed: 14
issues: 1
pending: 0
skipped: 0
cosmetic: 0
blocked: 0
note: "Re-test 2 (04-08) 2026-06-22. Cerrados por 04-08: 7-core (asignar tags a tarjetas del pipeline + auto-crear/asignar + filtro OR end-to-end), 13 (auto-asignar tag nueva), 14 ('Limpiar filtros' siempre visible). NUEVO issue abierto: 7 — falta quitar/modificar tags ya asignadas desde el pipeline (el TagManagerDialog es solo asignar+crear; los leads/deals no tienen surface de remove en ningún lado) + minor 'No hay tags disponibles' confuso. Fuera de scope (rounds previos): vista de ganados/perdidos (test 5), eliminar tareas completadas (test 11), copy 'Churn'→'Bajas' (test 14)."

## Gaps

- truth: "El botón '+ Nuevo deal' abre un diálogo y al completar contacto/valor/etapa y confirmar, la tarjeta aparece en la columna elegida"
  status: diagnosed
  reason: "User reported: el deal SÍ se crea pero no aparece al instante; recién se ve al navegar a otra pantalla y volver. La UI del tablero no se refresca tras createDeal."
  severity: major
  test: 4a
  root_cause: "createDeal SÍ llama revalidatePath(PIPELINE_PATH) (_pipeline-actions.ts:111), pero el tablero renderiza desde estado local useState(initialDeals) (pipeline-client.tsx:73). handleCreateDeal (pipeline-client.tsx:134-153) solo cierra el diálogo y hace toast; nunca inserta la tarjeta en setDeals ni hace router.refresh(). revalidatePath invalida el cache server pero el componente cliente sigue montado con su estado viejo → el deal recién aparece al remontar (navegar y volver)."
  artifacts:
    - path: "app/(crm)/admin/pipeline/pipeline-client.tsx"
      issue: "handleCreateDeal (134-153) no sincroniza el nuevo deal con el estado local; no setDeals ni router.refresh()"
    - path: "app/(crm)/admin/_pipeline-actions.ts"
      issue: "createDeal (~100-111) retorna void; no devuelve la fila creada para inserción optimista"
  missing:
    - "Opción A (recomendada, consistente con markLost optimista): createDeal devuelve el deal creado y handleCreateDeal lo inserta con setDeals(prev => [nuevo, ...prev])"
    - "Opción B (mínima): router.refresh() tras éxito + useEffect(() => setDeals(initialDeals), [initialDeals]) para re-sincronizar el estado local"
  debug_session: ""

- truth: "El resumen '$ abiertos · $ ganados' refleja el estado de los deals; un deal que llega a la etapa final (Pago) cuenta como ganado"
  status: diagnosed
  reason: "User reported: puedo mover los deals en el pipeline pero los valores de abiertos/ganados no cambian, queda siempre como abiertos. Mover de etapa (stage) no marca el deal como ganado (status=won); no existe acción para marcar ganado, así que '$ ganados' queda siempre en $0."
  severity: major
  test: 5
  root_cause: "Doble causa. (1) stage y status son ortogonales (D-04): moveStage (_pipeline-actions.ts:50-54) solo cambia stage, nunca status; ninguna acción del tablero setea status='won' (solo convertLead/linkLeadOnSignup, atadas a onboarding). (2) Aunque se marcara won, page.tsx:49 filtra .eq('status','open'), así que los deals won no llegan al cliente y pipelineSummary (lib/crm-pipeline.ts:56-64) calcula wonTotal sobre deals que el cliente no tiene → siempre $0."
  artifacts:
    - path: "app/(crm)/admin/_pipeline-actions.ts"
      issue: "moveStage (50-54) solo update stage; no hay markWon ni transición a status='won'"
    - path: "app/(crm)/admin/pipeline/page.tsx"
      issue: "línea 49: filtro .eq('status','open') excluye los won del cálculo del header"
    - path: "lib/crm-pipeline.ts"
      issue: "pipelineSummary (56-64) clasifica por status pero nunca recibe deals won"
  missing:
    - "DECIDIDO POR EL USUARIO: Enfoque 2 — acción explícita markWon (espejo de markLost): setea status='won', audita 'deal.won' (código nuevo en ACTION_LABEL), revalida; botón 'Marcar ganado' en la tarjeta junto a 'Marcar perdido' (saca la tarjeta del board optimistamente). NO acoplar stage↔status."
    - "El header necesita los deals won — calcular wonTotal server-side (query aparte sumando status='won') y pasarlo como prop, o ampliar la query del RSC; mantener las columnas mostrando solo open"
  debug_session: ""

- truth: "Una tarea creada en la ficha puede marcarse como completada desde la UI (completeTask); cada nota/tarea aparece una sola vez en el timeline"
  status: diagnosed
  reason: "User reported: la tarea se crea y aparece en el timeline pero no hay opción/control para marcarla como completada. La server action completeTask existe pero falta el affordance en la UI (ficha-client). Observación extra: cada nota/tarea aparece duplicada en el timeline — el evento de auditoría ('Creó nota'/'Creó tarea', kind=cambio) y la entrada propia ('Nota'/'Tarea creada', kind=nota/tarea) se muestran ambos."
  severity: major
  test: 11
  root_cause: "(BUG completar) completeTask está importada en ficha-client.tsx:32 pero NUNCA se invoca; TimelineTab (664-800) no tiene checkbox/botón de completar. Además las tareas NO se leen con id en page.tsx (solo las notas, 114-125); la VIEW crm_timeline no expone id por fila, así que no hay id para pasar a completeTask. (BUG duplicado) cada nota/tarea genera 2 filas en crm_timeline: la fila de su tabla (rama notes/tasks de la VIEW, migr.034:229-251) Y la fila de audit_log que logAudit inserta (createNote _content-actions.ts:56-63, createTask 128-135), que entra por la rama audit_log de la VIEW (migr.034:217-225)."
  artifacts:
    - path: "app/(crm)/admin/negocios/[id]/ficha-client.tsx"
      issue: "completeTask importada (32) sin uso; TimelineTab sin affordance de completar tareas"
    - path: "app/(crm)/admin/negocios/[id]/page.tsx"
      issue: "tareas sin lectura con id (espejo de fichaNotes 114-125); filtro de lectura del timeline 74-79"
    - path: "supabase/migrations/034_crm_pipeline_tags_timeline.sql"
      issue: "VIEW crm_timeline (213-252) UNION ALL audit_log + notes + tasks → duplica nota/tarea (su fila + el audit)"
    - path: "app/(crm)/admin/_content-actions.ts"
      issue: "logAudit en createNote (56-63) y createTask (128-135) genera la fila 'cambio' duplicada"
  missing:
    - "Leer tasks con id en page.tsx (espejo de fichaNotes) + tipo FichaTask + prop tasks al client"
    - "Handler handleCompleteTask + checkbox/botón por tarea en TimelineTab (espejo del bloque showNotesManager de notas) que invoque completeTask({taskId, done}) + router.refresh()"
    - "Des-duplicar timeline (recomendado Opción A): nueva migración 035 que agregue WHERE action NOT IN ('note.create','note.edit','note.delete','task.create','task.complete') a la rama audit_log de la VIEW (mantiene audit_log intacto para el visor de auditoría). Aplicar a mano + regenerar schema.sql."
  debug_session: ""

- truth: "El botón '+Tag' en el Resumen de la ficha permite asignar/crear una tag para el negocio"
  status: diagnosed
  reason: "User reported: el botón +Tag existe pero está deshabilitado (inhabilitado); no se puede asignar ninguna tag. Bloquea todo el feature de tags — sin asignación no hay tags para filtrar en pipeline (test 7) ni en el directorio (test 14)."
  severity: major
  test: 13
  root_cause: "DEADLOCK. ficha-client.tsx:342 el botón +Tag tiene disabled={availableTags.length === 0 || pending}. availableTags (143-146) = catálogo menos asignadas; en instalación nueva la tabla tags está vacía → availableTags=[] → botón nace disabled. La ficha SOLO asigna tags existentes (handleAssignTag→assignTag); el diálogo lista solo availableTags. createTag existe en _tag-actions.ts:34 pero ficha-client.tsx NUNCA la importa ni la invoca (línea 33 solo assignTag/removeTag). Ninguna otra UI consume createTag → no hay forma de crear la primera tag → catálogo nunca se llena. Deadlock global del feature de tags."
  artifacts:
    - path: "app/(crm)/admin/negocios/[id]/ficha-client.tsx"
      issue: "línea 342 disabled incluye availableTags.length===0; línea 33 no importa createTag; diálogo 556-588 solo asigna existentes"
    - path: "app/(crm)/admin/_tag-actions.ts"
      issue: "createTag (34) implementada pero sin consumidor en la UI"
  missing:
    - "Importar createTag en ficha-client.tsx"
    - "Quitar availableTags.length===0 del disabled del botón +Tag (dejar disabled={pending})"
    - "Input 'Crear tag' en el diálogo que invoque createTag({label,color}) (validar con createTagSchema) + router.refresh(); idealmente createTag retorna el id para encadenar assignTag en un paso"
  debug_session: ""

- truth: "En el ConfirmDialog, el badge de riesgo se alinea junto al título de la acción, no superpuesto/debajo del botón X de cerrar"
  status: diagnosed
  reason: "User reported: en el ConfirmDialog de 'Borrar nota', el badge 'Medio' aparece debajo de la X de cerrar; debería ir al lado del título 'Borrar nota'. Cosmético (afecta el ConfirmDialog compartido)."
  severity: cosmetic
  test: 12
  root_cause: "components/crm/confirm-dialog.tsx:231 el header usa flex justify-between → empuja el RiskBadge al extremo derecho del popup. La X de cerrar (dialog.tsx:68) está absolute top-2 right-2, fuera del flujo, así que no reserva espacio: el badge cae justo debajo de la X y se superpone. No es columna equivocada — es justify-between mandando el badge a la misma coordenada que la X absoluta."
  artifacts:
    - path: "components/crm/confirm-dialog.tsx"
      issue: "línea 231: flex items-center justify-between gap-2 sin reservar espacio para la X absoluta"
    - path: "components/ui/dialog.tsx"
      issue: "línea 68: X absolute top-2 right-2 (global a todos los dialogs, no tocar)"
  missing:
    - "En confirm-dialog.tsx:231 cambiar 'flex items-center justify-between gap-2' por 'flex items-center gap-2 pr-8' → badge pegado al título a la izquierda, X sola en su esquina"
  debug_session: ""

- truth: "Al crear un deal con un email que ya pertenece a un lead, el contacto debe guardarse con el nombre que el operador escribe en el formulario"
  status: diagnosed
  reason: "User reported: marqué como perdido el lead 'Club Nautico Zárate' (mail francovellani@gmail.com). Creé un deal nuevo con nombre 'Franco Vellani' y el mismo mail, y se guardó automáticamente como 'Club Náutico Zárate' (nombre viejo del lead). createDeal reusa el lead por email pero NO actualiza el nombre del lead al nombre de contacto provisto; además reusa un lead ya marcado perdido."
  severity: major
  test: 4b
  root_cause: "createDeal inserta el deal con title=data.leadName (_pipeline-actions.ts:100), PERO la tarjeta muestra lead.name con prioridad: page.tsx:89 contactName = lead?.name ?? d.title ?? 'Sin nombre'. La rama reuse-by-email (_pipeline-actions.ts:78-86) toma el id del lead viejo y nunca actualiza leads.name → la tarjeta muestra el nombre viejo. Además la búsqueda de reuse no filtra status: reusa cualquier lead con ese email, incluso ya convertido/perdido."
  artifacts:
    - path: "app/(crm)/admin/_pipeline-actions.ts"
      issue: "líneas 78-86: reuse-by-email no actualiza leads.name ni filtra leads convertidos/perdidos"
    - path: "app/(crm)/admin/pipeline/page.tsx"
      issue: "línea 89: lead.name tiene prioridad sobre deal.title en el ?? → muestra nombre viejo"
  missing:
    - "DECIDIDO POR EL USUARIO: No reusar leads perdidos/convertidos. Acotar el query de reuse-by-email (_pipeline-actions.ts:78-86) para reusar solo leads activos (ej. .is('business_id', null) y/o que no estén marcados perdidos); si no hay lead activo con ese email, crear uno nuevo con data.leadName."
    - "Complementario (combinable, recomendado): en page.tsx:89 priorizar d.title ?? lead?.name para que la tarjeta muestre siempre el nombre con que se creó el deal (cubre el caso de reuse de lead activo con nombre distinto)"
  debug_session: ""

- truth: "El filtro de tags del pipeline es funcional end-to-end: se pueden asignar tags a un deal/lead y luego filtrar el tablero por ellas (OR)"
  status: diagnosed
  reason: "User reported (re-test 2026-06-22): los chips de tags aparecen en el pipeline pero no hay forma de agregarle tags a los deals, solo a los negocios. El filtro existe pero ninguna tarjeta puede tener tags."
  severity: major
  test: 7
  root_cause: "Deviation documentada en 04-02-SUMMARY: se construyeron los chips por tarjeta + el filtro OR, pero NO la UI para asignar/quitar tags por tarjeta desde el tablero. El pipeline lee entity_tags con entity_type='lead' (pipeline/page.tsx:86,106 tagIdsFor('lead', d.lead_id)). La única UI de asignación de tags es la ficha del negocio (ficha-client.tsx) que llama assignTag con entity_type='business'. assignTag/removeTag (_tag-actions.ts) son genéricos (aceptan lead|business) pero ningún componente los invoca con entity_type='lead'. Sin afordance lead, ninguna tarjeta tiene tags → el filtro del pipeline nunca matchea."
  artifacts:
    - path: "app/(crm)/admin/pipeline/pipeline-client.tsx"
      issue: "tarjetas muestran chips y filtro OR pero no exponen control para asignar/quitar tags por tarjeta (entity_type='lead')"
    - path: "app/(crm)/admin/_tag-actions.ts"
      issue: "assignTag/removeTag soportan entity_type='lead' pero sin consumidor en la UI del tablero"
    - path: "app/(crm)/admin/pipeline/page.tsx"
      issue: "líneas 86,106: lee entity_tags solo para entity_type='lead'; coherente con la action faltante en la UI"
  missing:
    - "Agregar afordance de tags por tarjeta en el tablero (ej. menú/popover en la tarjeta que liste el catálogo + crear/asignar) que invoque assignTag/removeTag con entity_type='lead', entity_id=lead_id + refresco (espejo del +Tag de la ficha pero para lead)"
    - "Reusar el diálogo de tags de la ficha (createTag + assignTag) parametrizando entity_type para evitar duplicar UI"
  debug_session: ""

- truth: "Al crear una tag nueva desde el diálogo +Tag de la ficha, queda asignada al negocio en el mismo paso (sin tener que volver a tocarla en 'asignar existente')"
  status: diagnosed
  reason: "User reported (re-test 2026-06-22): al crear una tag, la pone en la sección 'asignar existente' y no se asigna sola, hay que tocarla. Papercut menor."
  severity: minor
  test: 13
  root_cause: "createTag (_tag-actions.ts:34) retorna void; ficha-client.tsx invoca createTag y luego router.refresh(), pero no encadena assignTag con el id de la tag recién creada (la diagnosis original ya lo marcaba como 'ideal'). La tag nueva cae en availableTags y requiere un click extra."
  artifacts:
    - path: "app/(crm)/admin/_tag-actions.ts"
      issue: "createTag retorna void; no devuelve el id para encadenar assignTag"
    - path: "app/(crm)/admin/negocios/[id]/ficha-client.tsx"
      issue: "handler de crear tag no auto-asigna la tag recién creada"
  missing:
    - "createTag retorna el id de la tag creada"
    - "El handler de crear tag encadena assignTag({entityType,entityId,tagId}) con el id devuelto + refresh, dejando la tag asignada en un solo paso"
  debug_session: ""

- truth: "En el directorio de negocios, cuando hay un filtro de tag activo (con resultados visibles) hay un control 'Limpiar filtros' disponible"
  status: diagnosed
  reason: "User reported (re-test 2026-06-22): no existe botón 'Limpiar filtros' cuando hay resultados; lo principal (filtrar por tag) funciona. Papercut menor."
  severity: minor
  test: 14
  root_cause: "El botón 'Limpiar filtros' (clearFilters) solo se renderiza dentro del EmptyState cuando filtered.length===0 (negocios-client.tsx:288-296). Con resultados visibles y tags activas no hay afordance dedicado para limpiar; se limpia des-toggleando el chip."
  artifacts:
    - path: "app/(crm)/admin/negocios/negocios-client.tsx"
      issue: "líneas 288-296: 'Limpiar filtros' atado al empty-state; no visible cuando hay resultados con filtro activo"
  missing:
    - "Mostrar un control 'Limpiar filtros' (o un 'x' en la fila de chips) cuando selectedTagIds.length>0 (o cualquier filtro activo), independiente del empty-state, que llame clearFilters"
  debug_session: ""

- truth: "Desde una tarjeta del pipeline (lead/deal) se puede quitar/modificar una tag ya asignada, no solo asignar/crear"
  status: failed
  reason: "User reported (re-test 2 2026-06-22, tras 04-08): el TagManagerDialog del pipeline solo asigna existentes y crea nuevas; no hay forma de QUITAR una tag ya asignada a la tarjeta. Como la ficha solo gestiona tags de business, un lead/deal no tiene ningún surface para quitar una tag → una tag mal puesta queda permanente. Secundario (minor): cuando todas las tags del catálogo ya están asignadas, 'asignar existente' muestra 'No hay tags disponibles', confuso porque parece que se perdieron las tags."
  severity: major
  test: 7
  root_cause: "El TagManagerDialog compartido (components/crm/tag-manager-dialog.tsx) se diseñó deliberadamente como 'solo asignar + crear' (04-08 lo excluyó a propósito, comentario líneas 14-16). Recibe la prop assignedTags (34,42) pero SOLO la usa para calcular assignedIds/availableTags (51-55) y nunca la renderiza con un afordance de quitar; tampoco importa removeTag (import línea 25 solo createTag/assignTag). En la ficha el quitar vive aparte (fila de chips removable + ConfirmDialog, ficha-client.tsx:341-342,578), pero ESE flujo es para entity_type='business'; el pipeline usa entity_type='lead' y su única UI de tags es este diálogo → un lead/deal no tiene NINGÚN surface para quitar una tag. El 'No hay tags disponibles' es el efecto colateral: availableTags = catálogo − asignadas, con todas asignadas queda vacío y, sin sección de asignadas, el diálogo parece 'create-only'."
  artifacts:
    - path: "components/crm/tag-manager-dialog.tsx"
      issue: "recibe assignedTags pero no la renderiza con quitar; no importa removeTag (línea 25); el diálogo es asignar+crear únicamente"
    - path: "app/(crm)/admin/_tag-actions.ts"
      issue: "removeTag (96) ya es genérico (entityType lead|business) — sin consumidor en el diálogo del pipeline"
    - path: "components/crm/tag-chip.tsx"
      issue: "ya soporta removable + onRemove (X de lucide) — listo para reusar en la sección 'Asignadas'"
  missing:
    - "Agregar una sección 'Asignadas' en tag-manager-dialog.tsx que renderice assignedTags como <TagChip removable onRemove={() => handleRemove(t)} /> (espejo de la fila de la ficha)."
    - "Importar removeTag desde @/app/(crm)/admin/_tag-actions; handler handleRemove con pending/try-catch + toast como handleAssignExisting → removeTag({ tagId, entityType, entityId }) + onChanged()."
    - "Esto le da al pipeline (entityType='lead') el surface de quitar tags que hoy no existe, y muestra las asignadas (cierra el minor 'No hay tags disponibles' confuso)."
    - "Decisión de UX (planner, técnica): la ficha YA quita tags con su ConfirmDialog verificado en la fila del Resumen — NO tocar ese flujo. El remove del diálogo aplica como mínimo a entityType='lead'; evaluar si conviene también en business sin duplicar/confundir (ej. mantener el remove del diálogo solo para lead, o aceptarlo en ambos como afordance directo de bajo riesgo). Sin dependencias nuevas; reusar TagChip/removeTag existentes."
  debug_session: ""
