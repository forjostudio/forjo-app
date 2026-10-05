'use client'

import * as React from 'react'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// Campo de hora propio, SIEMPRE en 24 horas.
//
// POR QUÉ EXISTE (medido, no estético): un `<input type=time>` decide 12 vs 24 horas por el locale
// del SISTEMA OPERATIVO, no por el HTML. No hay atributo para forzarlo — `app/layout.tsx:56` ya
// declara `lang="es"` y el celular del dueño igual mostraba "9:00 a. m.". La única salida es no
// usar el control nativo. De paso cierra el otro reclamo (backlog v0.22): el nativo abre la ruedita
// del reloj en mobile en vez del teclado, y acá `inputMode="numeric"` abre el teclado numérico.
//
// Señal de que el nativo ya venía molestando: 4 call sites escondían a mano parte del control
// (`max-sm:[&::-webkit-calendar-picker-indicator]:hidden`). Ese hack se borra con este componente.
//
// NO es un dropdown ni un picker con rueda: es un campo de TEXTO disciplinado. Se construye SOBRE
// `components/ui/input.tsx` (un solo `<input>`, sin wrapper) para heredar foco visible, `disabled` y
// `aria-invalid` sin duplicar estilos — y porque varios call sites le pasan `flex-1` / `w-full` por
// `className`: esa clase TIENE que caer en el elemento que participa del flex de la fila. Un `<span>`
// envolvente rompería `flex-1` y con eso la fila de Agenda, que está medida y peleada.

// ── Lógica pura (lo testeable; la mecánica de React queda abajo) ─────────────────────────────────

/**
 * Lo que el campo acepta MIENTRAS se tipea. No corrige: sólo rechaza lo que no puede ser una hora.
 *
 * Deja pasar dígitos y a lo sumo UN `:`, con techo de 2 dígitos por lado. No inserta el `:` solo:
 * una máscara que escribe mientras el dueño escribe pelea con el cursor, y acá escribir importa más
 * que corregir (la corrección es trabajo del `onBlur`). Filtra también lo pegado desde el
 * portapapeles, porque un input controlado dispara `onChange` también al pegar.
 */
export function sanitizeTimeTyping(raw: string): string {
  const clean = raw.replace(/[^\d:]/g, '')
  if (!clean.includes(':')) return clean.slice(0, 4)
  const parts = clean.split(':')
  let hours = parts[0]
  let minutes = parts.slice(1).join('')
  // Si quien escribió puso el `:` DESPUÉS de los 4 dígitos ("0930:"), el excedente de la hora se
  // corre a los minutos en vez de tirarse: "0930:" → "09:30", no "09:".
  if (hours.length > 2) {
    minutes = hours.slice(2) + minutes
    hours = hours.slice(0, 2)
  }
  return `${hours}:${minutes.slice(0, 2)}`
}

/**
 * Lo que queda al SALIR del campo. Devuelve `''` o un `'HH:MM'` válido de 24 horas, nunca otra cosa.
 *
 * ESTE ES EL CORAZÓN DEL COMPONENTE. Las reglas, y el por qué de cada una:
 *
 * - `''` → `''`. El vacío es FUNCIONAL, no un caso borde: `app/(onboarding)/onboarding/page.tsx:397`
 *   y `lib/agenda-hours-payload.ts:135` documentan el bug ya pagado (la comparación de orden es
 *   lexicográfica y miente con `''`; del otro lado el `::time` del RPC revienta con 22007). Las dos
 *   pantallas validan FORMA antes que ORDEN justamente para eso, así que el campo tiene que poder
 *   seguir emitiendo `''`.
 *
 * - 1 o 2 dígitos → hora en punto: `9` → `09:00`, `18` → `18:00`. Es la intención obvia.
 *
 * - 3 o 4 dígitos → posicional desde la DERECHA, los dos últimos son minutos: `930` → `09:30`,
 *   `0930` → `09:30`, `123` → `01:23`, `1230` → `12:30`. Es la convención de cualquier reloj
 *   digital, y es el camino de PRIMERA CLASE acá: el teclado numérico de mobile no trae `:`, así que
 *   tipear 4 dígitos sin separador tiene que funcionar perfecto.
 *
 * - Con `:`, el minuto es LITERAL: `9:3` → `09:03` (no `09:30`). Quien escribió el separador ya
 *   declaró que lo que sigue es el campo de minutos. Es la asimetría a propósito contra `930`.
 *
 * - `9:` → `09:00`: falta el minuto y completar a la hora en punto es la única lectura razonable.
 *   `:30` en cambio NO se adivina (sería inventar la medianoche), cae en inválido.
 *
 * - Fuera de rango (`25:00`, `9:70`) o ilegible → `''`. NO se clampea a `23:00`: inventar una hora
 *   que nadie pidió es peor que vaciar. Y vaciar no es un invento nuevo: es exactamente el contrato
 *   que daba el nativo (o `''` o una hora válida), así que el error que ve el dueño es el de
 *   validación que las pantallas YA tienen escrito para el vacío. El campo se vacía = "no te
 *   entendí", con feedback inmediato y sin tocar ninguna validación.
 */
export function normalizeTimeOnBlur(raw: string): string {
  const clean = raw.trim()
  if (clean === '') return ''

  let hours: number
  let minutes: number

  const withColon = /^(\d{1,2}):(\d{0,2})$/.exec(clean)
  if (withColon) {
    hours = Number(withColon[1])
    minutes = withColon[2] === '' ? 0 : Number(withColon[2])
  } else if (/^\d{1,4}$/.test(clean)) {
    if (clean.length <= 2) {
      hours = Number(clean)
      minutes = 0
    } else {
      hours = Number(clean.slice(0, clean.length - 2))
      minutes = Number(clean.slice(-2))
    }
  } else {
    return ''
  }

  if (hours > 23 || minutes > 59) return ''
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

/**
 * `true` si el texto YA es una hora completa de 24 horas.
 *
 * Espeja a propósito la regex de `isValidBlockTime` (`lib/agenda-hours-payload.ts`) sin importarla:
 * este componente es genérico de `components/ui` y no debe depender de una lib de la Agenda, y sobre
 * todo NO decide qué es válido para ninguna pantalla. Lo único que decide con esto es CUÁNDO avisarle
 * al padre mientras se tipea (ver `handleChange`).
 */
export function isCompleteTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

/**
 * Qué emitir al CONFIRMAR el campo (al salir, o con Enter). `null` = no emitir nada.
 *
 * Vive como función aparte —y no como tres líneas adentro de `commit()`— porque es la única parte de
 * la confirmación que el entorno `node` de Vitest puede medir, y lo que decide es justo lo que se
 * puede romper al soltar el foco: CUÁNTAS veces se le avisa al padre.
 *
 * Confirmar DOS VECES el mismo gesto dejó de ser hipotético desde que Enter baja el teclado: el
 * `blur()` dispara `onBlur` de forma SÍNCRONA, antes de que React haya aplicado el `setDraft(null)`
 * del primer commit, así que el segundo commit corre con el borrador VIEJO. Por eso el borrador se
 * lee por `ref` (se escribe en el acto) y no por estado (se escribe recién en el próximo render).
 *
 * Idempotente POR CONSTRUCCIÓN, no por casualidad: sin borrador vivo no hay nada que confirmar.
 *
 * `null` y `''` son cosas distintas a propósito: `''` es un valor LEGÍTIMO que hay que emitir (el
 * vacío funcional de `normalizeTimeOnBlur`), así que el "no emitir nada" necesita un centinela que
 * no pueda confundirse con una hora posible.
 */
export function decideTimeCommit(draft: string | null, value: string): string | null {
  if (draft === null) return null
  const normalized = normalizeTimeOnBlur(draft)
  // Y tampoco se avisa cuando lo normalizado es lo que el padre YA tiene: un `onValueChange` que no
  // cambia nada ensucia el estado sucio de la pantalla (la Agenda marca "sin guardar" con eso).
  return normalized === value ? null : normalized
}

// ── Componente ──────────────────────────────────────────────────────────────────────────────────

type TimeFieldProps = Omit<React.ComponentProps<'input'>, 'type' | 'value' | 'onChange'> & {
  /** Hora en `'HH:MM'` de 24 horas, o `''`. */
  value: string
  /**
   * Recibe el string directo, no un evento: los call sites hacían `e.target.value` para llegar a lo
   * mismo. El padre SÓLO recibe `''` o un `'HH:MM'` válido — nunca un parcial como `'09'` o `'0930'`
   * —, que es el mismo contrato que daba el input nativo y lo que esperan los consumidores de estos
   * valores (validaciones, chequeos de disponibilidad, payloads del RPC).
   */
  onValueChange: (value: string) => void
}

export function TimeField({
  value,
  onValueChange,
  className,
  placeholder = 'HH:MM',
  title = 'Hora en formato 24 horas (HH:MM)',
  onBlur,
  onKeyDown,
  ...props
}: TimeFieldProps) {
  // El borrador es lo que se VE mientras se escribe; `null` significa "mostrá el valor del padre".
  // Existe porque el padre sólo recibe horas completas: sin él, tipear "0930" (sin `:`, el camino del
  // teclado numérico) sería imposible, porque el primer dígito volvería del padre pisado.
  // `null` en vez de copiar el valor en un estado evita el espejo que se desincroniza cuando el padre
  // cambia la hora por su cuenta (Agenda al cargar datos, onboarding al agregar un bloque).
  const [draft, setDraft] = React.useState<string | null>(null)
  // El MISMO borrador, además, en un ref. No es duplicación por comodidad: el estado es lo que se
  // RENDERIZA y el ref es lo que lee `commit()`, y hacen falta los dos porque `commit()` corre dos
  // veces en el mismo tick cada vez que se confirma con Enter (normaliza y después suelta el foco, y
  // `blur()` dispara `onBlur` en el acto). En esa segunda pasada el ESTADO todavía es el de antes del
  // primer commit —React recién lo aplica en el próximo render— mientras el ref ya está en `null`.
  const draftRef = React.useRef<string | null>(null)
  const shown = draft ?? value

  // Siempre los dos juntos: un borrador que vive sólo en el estado volvería a abrir la ventana de
  // confirmación doble que `decideTimeCommit` cierra.
  function setDraftBoth(next: string | null) {
    draftRef.current = next
    setDraft(next)
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const next = sanitizeTimeTyping(event.target.value)
    setDraftBoth(next)
    // Se avisa en el acto sólo cuando ya hay algo que el padre pueda usar: una hora completa, o el
    // vacío (que es un valor legítimo, restricción 1). Todo lo demás espera al `onBlur`.
    if (next === '' || isCompleteTime(next)) onValueChange(next)
  }

  // Normaliza y devuelve el control al padre. Se llama al salir del campo y con Enter. Llamarla dos
  // veces seguidas NO cambia el resultado ni avisa dos veces: la política está en `decideTimeCommit`.
  //
  // ⚠ Sin borrador vivo es un no-op, y eso es deliberado: antes normalizaba el valor del PADRE al
  // salir del campo sin haber escrito nada. Con los valores reales eso ya era un no-op (el padre sólo
  // tiene `''` o `'HH:MM'` — la Agenda y el onboarding los recortan a HH:MM en
  // `buildDayStatesFromRows`), pero si alguna vez entrara un `'09:00:00'` de la base, normalizar sin
  // que nadie haya tocado el campo lo VACIARÍA solo. Confirmar lo que nadie escribió no es trabajo
  // de este campo.
  function commit() {
    const emitted = decideTimeCommit(draftRef.current, value)
    setDraftBoth(null)
    // `!== null` y no un chequeo truthy: `''` es un valor que SÍ hay que emitir.
    if (emitted !== null) onValueChange(emitted)
  }

  return (
    <Input
      {...props}
      // `text` y no `time`: es TODO el punto del componente (el nativo elige 12/24hs por el locale
      // del SO). `inputMode="numeric"` abre el teclado numérico en mobile en vez de la ruedita.
      type="text"
      inputMode="numeric"
      // Sin `pattern` a propósito: engancharía el campo a la validez NATIVA del form y un parcial
      // como "0930" (válido mientras se tipea) podría frenar un submit que la app valida por su
      // cuenta. Restricción: el componente cambia CÓMO se escribe la hora, no qué es válido.
      autoComplete="off"
      spellCheck={false}
      enterKeyHint="done"
      // `size` da el ancho INTRÍNSECO (5 caracteres = "09:00"), y es lo que mantiene sano el único
      // call site que no fija ancho por clase (`w-auto min-w-24`, onboarding): ahí el piso de 96px
      // sigue decidiendo el ancho, igual que antes. Donde hay `w-full` o `flex-1`, la clase gana y
      // `size` no influye. Va después de `...props` como todo lo que define QUÉ es este campo: un
      // call site no debería poder convertirlo en otra cosa.
      size={5}
      value={shown}
      onChange={handleChange}
      onBlur={event => {
        commit()
        onBlur?.(event)
      }}
      onKeyDown={event => {
        // Enter normaliza también: en mobile el "listo" del teclado no siempre dispara blur, y así la
        // hora queda completa antes de que el dueño toque Guardar.
        //
        // Y además BAJA EL TECLADO (UAT en celular del quick 261005-n41): confirmar dejaba el foco en
        // el campo y Android mantiene el teclado abierto mientras el campo lo tenga, tapando media
        // pantalla. No hay API para cerrar el teclado; soltar el foco es el único camino.
        //
        // ⚠ EL ORDEN ES EL ARREGLO: `commit()` PRIMERO, soltar el foco DESPUÉS. Al revés, el `onBlur`
        // llegaría primero y normalizaría igual, pero el commit de Enter quedaría confirmando un
        // borrador ya descartado. Como `blur()` dispara `onBlur` de forma SÍNCRONA, cada Enter que
        // suelta el foco corre `commit()` DOS VECES: la segunda es un no-op garantizado por
        // `decideTimeCommit` (sin borrador no hay nada que confirmar), no por suerte de timing.
        // Medido con el componente real en Chrome: 1 solo `onValueChange` por Enter; con el borrador
        // sólo en el estado (sin el ref) el mismo gesto emitía 2.
        //
        // ⚠ Nunca se llama `preventDefault()`: lo que el navegador haga con Enter es del navegador.
        //
        // ⚠ Y el foco se suelta SÓLO si el campo no vive en un `<form>`. No es paranoia: está MEDIDO
        // en Chrome con el componente real. El submit implícito de Enter lo dispara el navegador en el
        // evento de CARÁCTER, que llega después del `keydown`; si el campo ya se blureó, ese submit no
        // ocurre. Con un `<form>` de prueba alrededor: sin blur → 1 submit (lo de hoy), con blur
        // síncrono → 0 submits. Y diferir el blur (microtask, rAF, `setTimeout(0)`) tampoco lo salva:
        // las cuatro variantes dieron 0. O sea que no hay "momento correcto" para soltar el foco sin
        // comerse el submit — hay que no soltarlo.
        //
        // Hoy ninguno de los 4 call sites (agenda, horario especial, alta de turno, alta de abono)
        // tiene un `<form>`: el repo no tiene ni uno alrededor de estos campos, así que el teclado baja
        // en los 4 y no hay nada que preservar. El guard es para el día que alguien ponga un
        // `TimeField` dentro de un form: ahí Enter seguirá enviando como ahora. Perder el envío en
        // silencio es mucho peor que un teclado que queda abierto, que al menos se ve.
        if (event.key === 'Enter') {
          // El elemento se captura ANTES de confirmar: `currentTarget` sólo es el input mientras React
          // está despachando este handler.
          const input = event.currentTarget
          commit()
          if (!input.form) input.blur()
        }
        onKeyDown?.(event)
      }}
      placeholder={placeholder}
      // `title` queda como DESCRIPCIÓN accesible del formato sin agregar un nodo al DOM (no se puede
      // envolver el input: `flex-1` tiene que caer en él). El NOMBRE accesible lo pone cada call site:
      // `<Label htmlFor>` donde hay label visible, `aria-label` en las filas que no tienen.
      title={title}
      className={cn(
        // `touch-manipulation`: saca el delay de doble-tap del navegador, así el primer toque entra.
        // `tabular-nums`: los dígitos no bailan mientras se escribe en un campo centrado.
        //
        // ⚠ 44×44 vs el alto de la fila: el alto se queda en `h-8` (32px) del `Input`, igual que el
        // nativo que reemplaza. Agrandar la caja rompería la fila de Agenda, que está medida
        // (`agenda-client.tsx:1262`) — y no hay forma de ampliar el área táctil de un `<input>` sin
        // tocar su caja ni agregar DOM: los pseudo-elementos NO se renderizan en inputs (por eso el
        // truco de `-my-3` que sí usan los BOTONES del repo no aplica acá). Lo que sí mejora, medido:
        // a lo ancho son ≥115px (muy por encima de 44) y ahora TODA la caja es superficie de tipeo,
        // mientras el nativo gastaba ~20px en el ícono del reloj y partía el resto en segmentos
        // hora/minuto que había que acertar por separado.
        'touch-manipulation tabular-nums',
        className
      )}
    />
  )
}
