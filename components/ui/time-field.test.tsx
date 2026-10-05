// Matriz del campo de hora propio (quick 261005-n41).
//
// POR QUÉ EXISTE: el componente reemplaza los 8 `<input type=time>` del panel y del onboarding, y
// lo único que hace de verdad es TRADUCIR texto a `'HH:MM'` de 24 horas. Esa traducción es la que
// puede romper dos pantallas enteras: si deja de poder emitir `''`, la validación de forma de
// `validateHours()` / `isValidBlockTime()` pierde su caso (el vacío funcional, con el bug 22007 ya
// pagado); si inventa una hora, el dueño guarda algo que no escribió. Acá queda congelada.
//
// CÓMO: entorno `node` sin DOM y cero paquetes nuevos (mismo molde que
// components/dashboard/categorias-manager.test.tsx). La política vive en funciones puras —igual que
// lib/panel-history.ts separa política de mecánica— y el render se verifica con
// `renderToStaticMarkup` contando atributos sobre el HTML.

import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TimeField, isCompleteTime, normalizeTimeOnBlur, sanitizeTimeTyping } from './time-field'

const noop = () => {}

// ── Suite 1: el vacío, que es la restricción que manda ──────────────────────────────────────────
describe('normalizeTimeOnBlur — el vacío es un valor, no un error', () => {
  it('deja pasar el string vacío tal cual', () => {
    expect(normalizeTimeOnBlur('')).toBe('')
  })

  it('un campo con sólo espacios también sale vacío', () => {
    expect(normalizeTimeOnBlur('   ')).toBe('')
  })
})

// ── Suite 2: parciales → la hora que el dueño quiso escribir ────────────────────────────────────
describe('normalizeTimeOnBlur — parciales', () => {
  it('1 o 2 dígitos son la hora en punto', () => {
    expect(normalizeTimeOnBlur('9')).toBe('09:00')
    expect(normalizeTimeOnBlur('09')).toBe('09:00')
    expect(normalizeTimeOnBlur('18')).toBe('18:00')
    expect(normalizeTimeOnBlur('0')).toBe('00:00')
    expect(normalizeTimeOnBlur('23')).toBe('23:00')
  })

  it('3 o 4 dígitos son posicionales desde la derecha (el camino del teclado numérico)', () => {
    expect(normalizeTimeOnBlur('930')).toBe('09:30')
    expect(normalizeTimeOnBlur('0930')).toBe('09:30')
    expect(normalizeTimeOnBlur('1230')).toBe('12:30')
    expect(normalizeTimeOnBlur('123')).toBe('01:23')
    expect(normalizeTimeOnBlur('2359')).toBe('23:59')
    expect(normalizeTimeOnBlur('000')).toBe('00:00')
  })

  it('con `:` el minuto es LITERAL — la asimetría a propósito contra `930`', () => {
    expect(normalizeTimeOnBlur('9:3')).toBe('09:03')
    expect(normalizeTimeOnBlur('9:30')).toBe('09:30')
    expect(normalizeTimeOnBlur('09:5')).toBe('09:05')
    expect(normalizeTimeOnBlur('18:00')).toBe('18:00')
  })

  it('falta el minuto → hora en punto; falta la HORA → no se adivina', () => {
    expect(normalizeTimeOnBlur('9:')).toBe('09:00')
    expect(normalizeTimeOnBlur('18:')).toBe('18:00')
    // Inventar la medianoche a partir de `:30` sería adivinar: cae en inválido y el campo se vacía.
    expect(normalizeTimeOnBlur(':30')).toBe('')
    expect(normalizeTimeOnBlur(':')).toBe('')
  })

  it('una hora completa y válida sale intacta', () => {
    for (const t of ['00:00', '09:00', '13:45', '23:59']) {
      expect(normalizeTimeOnBlur(t)).toBe(t)
    }
  })
})

// ── Suite 3: lo ilegible se vacía, NO se clampea ────────────────────────────────────────────────
describe('normalizeTimeOnBlur — fuera de rango e ilegible', () => {
  it('fuera de rango vacía el campo en vez de inventar una hora cercana', () => {
    // `25:00` NO se convierte en `23:00`: el dueño nunca pidió las 23.
    expect(normalizeTimeOnBlur('25:00')).toBe('')
    expect(normalizeTimeOnBlur('24:00')).toBe('')
    expect(normalizeTimeOnBlur('9:70')).toBe('')
    expect(normalizeTimeOnBlur('99')).toBe('')
    expect(normalizeTimeOnBlur('2470')).toBe('')
  })

  it('cualquier texto que no se pueda leer como hora vacía el campo', () => {
    for (const raw of ['ab:cd', '9:30 pm', '1:2:3', '12345', '-1:00', '9,30']) {
      expect(normalizeTimeOnBlur(raw)).toBe('')
    }
  })

  it('la salida SIEMPRE es `` o una hora que isCompleteTime acepta', () => {
    const entradas = ['', ' ', '9', '930', '0930', '9:3', '9:', ':30', '25:00', 'ab', '12345', '0']
    for (const raw of entradas) {
      const out = normalizeTimeOnBlur(raw)
      expect(out === '' || isCompleteTime(out)).toBe(true)
    }
  })
})

// ── Suite 4: lo que se puede tipear (rechaza, no corrige) ───────────────────────────────────────
describe('sanitizeTimeTyping — mientras se escribe', () => {
  it('deja escribir los parciales sin tocarlos', () => {
    for (const raw of ['', '0', '09', '093', '0930', '9:', '9:3', '09:30']) {
      expect(sanitizeTimeTyping(raw)).toBe(raw)
    }
  })

  it('tira todo lo que no es dígito ni `:` (incluido lo pegado)', () => {
    expect(sanitizeTimeTyping('9:30 pm')).toBe('9:30')
    expect(sanitizeTimeTyping('a9b3c0')).toBe('930')
    expect(sanitizeTimeTyping('09.30')).toBe('0930')
  })

  it('pone techo a los dígitos y colapsa los `:` de más', () => {
    expect(sanitizeTimeTyping('09305')).toBe('0930')
    expect(sanitizeTimeTyping('09:305')).toBe('09:30')
    expect(sanitizeTimeTyping('0:9:3')).toBe('0:93')
    expect(sanitizeTimeTyping('123:456')).toBe('12:34')
  })

  it('el `:` tipeado después de los 4 dígitos corre el excedente a los minutos', () => {
    // "0930:" no pierde el 30: queda "09:30" y el blur lo normaliza igual.
    expect(sanitizeTimeTyping('0930:')).toBe('09:30')
  })

  it('nunca produce algo que normalizeTimeOnBlur no pueda leer sin inventar', () => {
    // Todo lo tipeable termina en `` o en una hora válida: no hay camino a un valor intermedio raro.
    for (const raw of ['9', '93', '930', '0930', '9:', '9:3', '09:30', '0930:']) {
      const out = normalizeTimeOnBlur(sanitizeTimeTyping(raw))
      expect(out === '' || isCompleteTime(out)).toBe(true)
    }
  })
})

// ── Suite 5: isCompleteTime (cuándo se le avisa al padre) ───────────────────────────────────────
describe('isCompleteTime', () => {
  it('acepta sólo horas completas de 24 horas', () => {
    expect(isCompleteTime('00:00')).toBe(true)
    expect(isCompleteTime('23:59')).toBe(true)
    expect(isCompleteTime('09:30')).toBe(true)
  })

  it('rechaza el vacío, los parciales y lo fuera de rango', () => {
    for (const v of ['', '9', '09', '0930', '9:3', '24:00', '23:60', '9:30 pm']) {
      expect(isCompleteTime(v)).toBe(false)
    }
  })
})

// ── Suite 6: el render (lo que llega al navegador del dueño) ────────────────────────────────────
describe('TimeField — render de servidor', () => {
  const html = renderToStaticMarkup(
    <TimeField
      value="09:00"
      onValueChange={noop}
      aria-label="Hora de inicio"
      className="min-w-0 flex-1 px-1.5 text-center text-sm"
    />
  )

  it('NO es un input de hora nativo: es texto con teclado numérico', () => {
    expect(html).toContain('type="text"')
    expect(html).not.toContain('type="time"')
    // En minúsculas porque Base UI emite estos atributos con el casing de React (`inputMode`), y en
    // HTML los nombres de atributo son case-insensitive: el navegador lee `inputmode` igual.
    expect(html.toLowerCase()).toContain('inputmode="numeric"')
    expect(html.toLowerCase()).toContain('enterkeyhint="done"')
  })

  it('no engancha el campo a la validez nativa del form', () => {
    // Un `pattern` haría inválido un parcial legítimo ("0930") y podría frenar un submit que la app
    // valida por su cuenta.
    expect(html).not.toContain('pattern=')
  })

  it('anuncia el formato y lleva nombre accesible', () => {
    expect(html).toContain('title="Hora en formato 24 horas (HH:MM)"')
    expect(html).toContain('placeholder="HH:MM"')
    expect(html).toContain('aria-label="Hora de inicio"')
  })

  it('muestra el valor del padre', () => {
    expect(html).toContain('value="09:00"')
  })

  it('es UN solo input, sin wrapper: `flex-1` cae en el elemento del flex', () => {
    expect(html.match(/<input/g)).toHaveLength(1)
    expect(html).not.toContain('<span')
    expect(html).not.toContain('<div')
  })

  it('conserva el alto y las clases de la fila que ya estaban medidas', () => {
    // El alto es el del Input del repo (h-8, 32px), igual que el nativo que reemplaza: la fila de
    // Agenda no puede cambiar de alto.
    expect(html).toContain('h-8')
    for (const cls of ['min-w-0', 'flex-1', 'px-1.5', 'text-center', 'text-sm']) {
      expect(html).toContain(cls)
    }
    // Y el ancho intrínseco queda a 5 caracteres, lo que mantiene sano el call site con `w-auto`.
    expect(html).toContain('size="5"')
  })

  it('hereda los estados del Input del repo: disabled y aria-invalid', () => {
    const deshabilitado = renderToStaticMarkup(
      <TimeField value="" onValueChange={noop} disabled aria-invalid />
    )
    expect(deshabilitado).toContain('disabled')
    expect(deshabilitado).toContain('aria-invalid')
    // El vacío llega al DOM como vacío, no como placeholder convertido en valor.
    expect(deshabilitado).toContain('value=""')
  })
})
