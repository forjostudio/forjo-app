// Código de reserva legible derivado del cancel_token (determinista, sin columna nueva).
// Formato FRJ-XXXXX. Solo para mostrar/comunicar al cliente; el id real sigue siendo el token.
export function bookingCode(token: string): string {
  return 'FRJ-' + token.replace(/[^a-zA-Z0-9]/g, '').slice(0, 5).toUpperCase()
}
