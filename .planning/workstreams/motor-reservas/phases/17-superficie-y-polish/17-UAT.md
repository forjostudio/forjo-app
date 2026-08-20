---
status: testing
phase: 17-superficie-y-polish
workstream: motor-reservas
milestone: v0.27
source: [17-VERIFICATION.md, 17-05-PLAN.md]
started: 2026-08-20
updated: 2026-08-20
---

# Phase 17 — UAT visual

**La verificación de código dio 5/5 y quedó en `human_needed`.** Lo que falta no es código: son cuatro
cosas que sólo se ven abriendo el navegador, y este workstream ya aprendió que ahí aparecen los defectos
que el pipeline verde no ve — tres de las siete observaciones de la UAT de la Phase 14 fueron de esas.

## Lo que la verificación NO pudo medir (y por qué)

| # | Ítem | Por qué no se pudo |
|---|---|---|
| 1 | Abrir el roster con un click real en la fila de grupo | JS de cliente; no hay navegador headless y agregarlo violaba el fence de dependencias de la fase |
| 2 | Teclado real en los campos de cupo (borrar / tipear / Tab / Escape) | idem — se sustituyó por una simulación 1:1 de la máquina de estados (18/18) |
| 3 | Layout a 375px del explicador y del control inline | el wrap real no se confirma sin render |
| 4 | Contraste en modo oscuro y en otra paleta | idem |

Todo lo demás **sí** se midió: el ejecutor de 17-05 atravesó el login y verificó 6 de 7 pasos contra el
HTML renderizado con datos reales, y el verifier reprodujo por su cuenta las dos pruebas de mutación y
corroboró el fixture contra el Postgres local.

---

## Guion de la UAT visual de la fase (para `/gsd:verify-work`)

⚠ **Esto NO lo cierra el ejecutor.** Los checkpoints de este workstream se auto-aprueban con
`auto_advance` sin que nadie abra el navegador, y tres de las siete observaciones humanas de la
Phase 14 reportaron defectos que el pipeline verde no veía. El guion queda escrito acá para que la
UAT tenga pasos concretos; hasta que un humano lo corra, la fase se declara **PENDIENTE DE UAT**.

**Preparación — YA HECHA en el Supabase local** (sembrada por el ejecutor de 17-05 el 2026-08-20, en
`Negocio de Prueba` / `negocio-prueba`, login `test@forjo.local` / `Forjo1234!`). No hay que cargar
nada a mano: abrí `/agenda` en la semana del **viernes 21 de agosto de 2026** y vas a encontrar

- **`Yoga grupal`** — `group_class`, cupo **6**, con 3 turnos a las **09:00** (Ana Gomez y Bruno Diaz
  confirmados, Carla Ruiz con la **seña pendiente** y el hold vivo).
- **`Pilates reformer`** — `group_class`, cupo **4**, con 1 turno a las **09:00** — el MISMO horario
  que Yoga, a propósito: son la prueba de que dos clases distintas **no se fusionan**.
- **`Corte`** — `individual`, 1 turno a las **11:00** (Elsa Mora).
- **`Color`** — `simultaneous_resource`, cupo 2, ya venía en el seed.

⚠ Si corriste `supabase db reset` después de esa fecha, la siembra se perdió (`seed.sql` recrea el
negocio pero no estos turnos) y hay que rehacerla a mano.

⚠ **Los pasos 1 a 6 miran pantallas de `17-01`/`17-02`/`17-03`.** Cuando cerró `17-05`, `17-03` (el
control inline de cupo en la tarjeta de servicio, wave 3) todavía no estaba ejecutado y esta nota
decía que la ausencia del stepper no era un defecto. **Ya no: `17-03` se ejecutó el 2026-08-20**
(commits `d7d1231`, `f8a8a59`, `044e820`), así que si la tarjeta de un servicio de cupo compartido
**no** muestra el stepper, eso SÍ es un defecto y hay que reportarlo. Los diez pasos son verificables.

1. **375px · `/settings` → Servicios → editar un servicio.** ¿Se leen tres bloques paralelos (no nueve
   líneas)? ¿Se entiende la diferencia entre grupal y simultáneo sin abrir nada más?
2. **375px · mismo diálogo.** ¿El "Guardar" se alcanza siempre? ¿El título queda fijo arriba?
3. **375px · mismo diálogo.** ¿Se puede borrar el número de lugares y escribir otro?
4. **375px · lista de servicios.** ¿El servicio `individual` se ve igual que antes (sin badge)? ¿El
   grupal muestra `Clase grupal · [−] 6 [+] lugares`?
5. **375px · tarjeta.** Cambiar el cupo con el `+`: ¿aparece el botón "Guardar"? Bajarlo de vuelta al
   valor original: ¿el botón desaparece **sin** guardar nada? Volver a subirlo y guardar: ¿dice
   "Guardando…" y después sale el toast `Cupo actualizado`, con la fila limpia? Mientras uno guarda,
   ¿el stepper del **otro** servicio de cupo compartido sigue usable? ¿El control entero (label +
   stepper + "lugares") baja a su propia línea sin partirse? Y dos cosas que tienen que **no** pasar:
   tocar el label `Clase grupal` no abre ni cambia nada (D-09: desde la tarjeta se cambia el número,
   nunca el modo), y la tarjeta nunca crece con un mensaje de error adentro — los errores salen por
   toast.
6. **375px · alta de servicio.** ¿El botón "Agregar servicio" está al final y rotulado?
7. **375px · `/agenda`, semana del vie 21 de ago.** En la celda del viernes tiene que haber **DOS
   filas de las 09:00**, una por clase: `09:00 · Pilates reformer · 👥 1/4` (badge neutro) y
   `09:00 · Yoga grupal · 👥 3/6 · 1 sin seña` (badge ámbar). ¿Cada una ocupa **una sola** fila?
   ¿El contador se ve **aunque no esté lleno**? ¿El nombre del servicio se trunca sin recortar el
   contador? ¿La semana sigue siendo legible? A las 11:00 el turno individual de Elsa Mora se ve como
   siempre y **no** es clickeable.
8. **375px · `/agenda`.** Tocar la fila de Yoga: ¿el título del roster dice
   `Yoga grupal · vie 21 de ago · 09:00` y lista a **Ana, Bruno y Carla** (y NO a Dora Paz, que es de
   Pilates)? ¿El contador del diálogo dice `3/6` y **lugares ocupados**? — **Este paso es el único de
   17-05 que el ejecutor no pudo medir**: la apertura del roster es JS de cliente y no había navegador
   en el entorno de ejecución. Todo lo demás de los pasos 7 y 8 se verificó contra el HTML renderizado
   con datos reales.
9. **375px · `/finances` → Turnos.** ¿Se ve el servicio bajo el nombre del cliente? ¿La fecha, el
   precio y el botón quedaron donde estaban?
10. **Modo oscuro y otra paleta.** Repetir 4, 7 y 9: ¿algún texto pierde contraste?
