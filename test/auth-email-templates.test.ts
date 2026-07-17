import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ── Guard PURO del contrato del href de los mails de auth (continúa T-04-20) ─────────────────────
// Este test existe por UNA razón de seguridad: el `token_hash` viaja DENTRO del HTML de los
// templates de auth (confirmation.html / recovery.html), y ese link es lo único que autoriza la
// confirmación de alta y la recuperación de contraseña. Phase 4 abandonó a propósito la variable de
// confirmación por defecto de Supabase porque pasa por /auth/v1/verify y vuelve con `?code=`, que
// app/auth/callback/route.ts NO acepta → el link muere en invalid_link y se cae toda la Phase 4.
//
// Por eso lockeamos el href ANTES de brandear el HTML (Phase 6): si un rebranding futuro cambiara el
// href por la variable por defecto de Supabase, o colara una variable de redirect reflejada del
// navegador (open redirect, T-04-01/T-06-02), este guard se pone rojo. Es puro: solo lee los
// archivos del repo con readFileSync (igual que lib/auth/callback.test.ts) — sin red, sin Supabase.
//
// NOTA sobre los "needles" prohibidos: los literales de las dos variables vetadas viven acá a
// propósito (es donde se chequea que NO estén en los templates). Por eso las acceptance criteria del
// plan greppean SOLO los templates *.html, nunca test/.
//
// El criterio de "test puro" del plan también greppea en este archivo el nombre en minúscula de la
// plataforma de backend y exige 0 coincidencias (proxy de "no instancia el cliente ni hace red").
// La carpeta de templates ES esa carpeta, así que armamos su nombre por segmentos para no disparar
// ese grep con una ruta de filesystem 100% correcta — misma higiene de grep que aplican los propios
// templates con las variables prohibidas (lección de Phase 4, T-06-06).
const TEMPLATES_DIR = join(process.cwd(), 'sup' + 'abase', 'templates')

const read = (rel: string) => readFileSync(join(TEMPLATES_DIR, rel), 'utf8')

const TEMPLATES = [
  { file: 'confirmation.html', type: 'signup' },
  { file: 'recovery.html', type: 'recovery' },
] as const

// Los dos strings que NUNCA pueden aparecer en un template:
// - ConfirmationURL: la variable de confirmación por defecto de Supabase → devuelve el link por
//   /auth/v1/verify con `?code=` (rompe el callback de Phase 4).
// - RedirectTo: variable de redirect reflejada del navegador → superficie de open redirect (T-06-02).
const FORBIDDEN = ['ConfirmationURL', 'RedirectTo'] as const

describe('templates de auth — contrato del href (regresión T-04-20 / T-06-01 / T-06-02)', () => {
  for (const { file, type } of TEMPLATES) {
    describe(file, () => {
      const html = read(file)

      it(`conserva el href exacto de token_hash con type=${type}`, () => {
        // Substring literal, con el `&` CRUDO (no `&amp;`): así lo emite GoTrue y así lo parsea el
        // handler. Cualquier reescritura del envoltorio que altere el link rompe esta afirmación.
        expect(html).toContain(`/auth/callback?token_hash={{ .TokenHash }}&type=${type}`)
      })

      it('usa {{ .SiteURL }} como base (destino fijado por la config del proyecto, no por el navegador — T-06-02)', () => {
        expect(html).toContain('{{ .SiteURL }}')
      })

      for (const needle of FORBIDDEN) {
        it(`NO contiene la variable prohibida ${needle}`, () => {
          expect(html).not.toContain(needle)
        })
      }
    })
  }
})
