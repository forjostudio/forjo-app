// Nombre completo del cliente (quick 261124-lfd, migr. 081).
//
// Por qué existe: desde la 081 el cliente tiene `name` (nombre de pila) y `last_name` (apellido
// opcional, solo lo carga el panel). Todo lugar del panel que muestra un cliente de la tabla
// `clients` tiene que leer «Nombre Apellido» igual; si cada pantalla armara su propio join, una se
// olvida del trim o del apellido vacío y el mismo cliente se ve distinto según dónde se mire. Por eso
// UNA sola fuente. Es el mismo molde que el join inline de profesionales en settings-client
// (`[p.name, p.last_name].filter(Boolean).join(' ')`), centralizado y con trim.
//
// Lo que NO sale de acá: el orden de las listas, la letra del índice y las iniciales del avatar
// siguen saliendo de `name` (nombre de pila).
//
// Módulo PURO, sin imports de servidor: lo usan componentes 'use client' y route handlers.

export function clientFullName(
  c: { name?: string | null; last_name?: string | null } | null | undefined,
): string {
  if (!c) return ''
  return [c.name, c.last_name]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
    .join(' ')
}

// Normalización del apellido que usan los tres escritores (alta manual, edición de la ficha,
// import): string con algo tras el trim → recortado; vacío, solo espacios o no-string → null.
// La base no tiene CHECK para last_name (igual que name): la regla vive acá.
export function normalizeLastName(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t : null
}
