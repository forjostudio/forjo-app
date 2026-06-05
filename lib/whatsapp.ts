// Normaliza un número de WhatsApp argentino al formato que espera wa.me: 549 + área +
// abonado (sin +, espacios, guiones, paréntesis, 0 inicial ni 15 de móvil).
//
// Devuelve solo dígitos (ej. "5491112345678") o null si no se puede formar un número
// nacional válido (10 dígitos área+abonado).
//
// Es IDEMPOTENTE: aplicado a un valor ya normalizado, devuelve el mismo valor. Por eso se
// puede usar tanto al guardar (settings/onboarding) como al armar el link en los emails
// (cubre datos viejos sin normalizar).
//
// Limitación conocida: sin tabla de códigos de área, el "15" se remueve por heurística
// (probando largo de área 2/3/4 y exigiendo que el nacional quede en 10 dígitos). Un
// número sin código de área no se puede desambiguar y puede quedar inválido.
export function normalizeArWhatsApp(raw: string | null | undefined): string | null {
  if (!raw) return null
  let d = raw.replace(/\D/g, '') // quita +, espacios, guiones, paréntesis, etc.
  if (!d) return null

  if (d.startsWith('00')) d = d.slice(2) // prefijo internacional 00
  if (d.startsWith('54')) d = d.slice(2) // código de país
  if (d.startsWith('9')) d = d.slice(1)  // 9 de móvil (54 9 ...)
  if (d.startsWith('0')) d = d.slice(1)  // 0 de larga distancia (011 -> 11)

  // 15 de móvil: aparece después del código de área. Probamos áreas de 2/3/4 dígitos y
  // removemos el "15" sólo si el nacional resultante queda en 10 dígitos (área + abonado).
  for (const areaLen of [2, 3, 4]) {
    if (d.length >= areaLen + 2 && d.slice(areaLen, areaLen + 2) === '15') {
      const candidate = d.slice(0, areaLen) + d.slice(areaLen + 2)
      if (candidate.length === 10) { d = candidate; break }
    }
  }

  // El número nacional (área + abonado) debe quedar en 10 dígitos.
  if (d.length !== 10) return null

  return '549' + d
}
