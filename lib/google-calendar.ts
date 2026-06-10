// Integración con Google Calendar (SERVER-ONLY). OAuth: el dueño conecta su cuenta de Google
// y guardamos su refresh_token en businesses.google_refresh_token. Con ese refresh_token
// pedimos access_tokens efímeros para crear/borrar eventos de sus turnos en su calendario
// primario. Scope mínimo: calendar.events (crear/borrar eventos, nada más).

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token'
const GOOGLE_REVOKE = 'https://oauth2.googleapis.com/revoke'
const CAL_API = 'https://www.googleapis.com/calendar/v3'

export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.events'
// Zona fija de Argentina (UTC-3, sin DST): los turnos se guardan en hora local AR.
const AR_TZ = 'America/Argentina/Buenos_Aires'

// ¿Están las credenciales OAuth en el entorno? Si no, la sincronización queda deshabilitada.
export function googleConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}

function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')
}

export function googleRedirectUri(): string {
  return `${appBaseUrl()}/api/google/callback`
}

// URL de consentimiento de Google. access_type=offline + prompt=consent fuerzan que Google
// devuelva un refresh_token (sin prompt, en re-conexiones no lo manda).
export function buildAuthUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    redirect_uri: googleRedirectUri(),
    response_type: 'code',
    scope: GOOGLE_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  })
  return `${GOOGLE_AUTH}?${p.toString()}`
}

// Canjea el code del callback por tokens. Devuelve { refresh_token, access_token } o null.
export async function exchangeCode(code: string): Promise<{ refresh_token?: string; access_token?: string } | null> {
  const res = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirect_uri: googleRedirectUri(),
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) {
    console.error('[google] exchangeCode falló:', res.status, await res.text().catch(() => ''))
    return null
  }
  return res.json()
}

// access_token efímero a partir del refresh_token guardado.
async function getAccessToken(refreshToken: string): Promise<string | null> {
  const res = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) {
    console.error('[google] refresh falló:', res.status, await res.text().catch(() => ''))
    return null
  }
  const j = await res.json()
  return j.access_token || null
}

// Revoca el acceso en Google (al desconectar). Best-effort.
export async function revokeToken(refreshToken: string): Promise<void> {
  try {
    await fetch(`${GOOGLE_REVOKE}?token=${encodeURIComponent(refreshToken)}`, { method: 'POST' })
  } catch (e) {
    console.error('[google] revoke falló:', e instanceof Error ? e.message : e)
  }
}

export interface CalEventInput {
  summary: string
  description?: string
  location?: string
  date: string // yyyy-MM-dd
  time: string // HH:mm[:ss]
  durationMinutes: number
}

// Crea un evento en el calendario primario del dueño. Devuelve el event id o null (best-effort).
export async function createCalendarEvent(refreshToken: string, ev: CalEventInput): Promise<string | null> {
  const token = await getAccessToken(refreshToken)
  if (!token) return null
  const start = new Date(`${ev.date}T${ev.time.slice(0, 5)}:00-03:00`)
  const end = new Date(start.getTime() + (ev.durationMinutes || 30) * 60000)
  const res = await fetch(`${CAL_API}/calendars/primary/events`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      summary: ev.summary,
      description: ev.description || undefined,
      location: ev.location || undefined,
      start: { dateTime: start.toISOString(), timeZone: AR_TZ },
      end: { dateTime: end.toISOString(), timeZone: AR_TZ },
    }),
  })
  if (!res.ok) {
    console.error('[google] createEvent falló:', res.status, await res.text().catch(() => ''))
    return null
  }
  const j = await res.json()
  return j.id || null
}

// Borra un evento del calendario primario. 404/410 (ya no existe) se trata como éxito.
export async function deleteCalendarEvent(refreshToken: string, eventId: string): Promise<void> {
  const token = await getAccessToken(refreshToken)
  if (!token) return
  const res = await fetch(`${CAL_API}/calendars/primary/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    console.error('[google] deleteEvent falló:', res.status, await res.text().catch(() => ''))
  }
}
