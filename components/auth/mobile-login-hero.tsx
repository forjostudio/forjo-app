'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useGoogleSignIn } from '@/components/auth/google-button'

// Login mobile de Forjo Gestión: hero full-screen (naranja de marca) con bottom sheet.
//
// SOLO mobile (≤760px): se renderiza como overlay `fixed inset-0` visible bajo `min-[760px]:hidden` y
// tapa la columna del form del (split)/layout. En desktop (≥760) queda display:none y manda el split
// lado-a-lado de siempre — por eso login/page.tsx muestra el form clásico con `hidden min-[760px]:block`.
//
// Diseño FIJO por decisión del usuario: hero naranja + sheet oscuro (#141110) sin importar claro/oscuro.
// Es la pantalla de entrada de marca. El reset de tema de auth (ONB-05) sigue intacto: acá los colores
// son literales hardcodeados de Forjo, no heredan la paleta del tenant.
//
// Reusa la lógica existente: signInWithPassword (form del sheet), useGoogleSignIn (CTA de Google, mismo
// redirectTo fijo que el desktop), y links a /register y /forgot-password. Inputs con ids propios
// (`m-login-*`) para no colisionar con el form desktop, que coexiste oculto en el mismo árbol.

const schema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
})
type FormData = z.infer<typeof schema>

const pill =
  'w-full min-h-[50px] rounded-full flex items-center justify-center gap-2.5 font-[family-name:var(--font-grotesk)] font-semibold text-[15.5px] transition-colors disabled:opacity-60'
const inputCls =
  'w-full bg-[#1c1815] border border-[#332d24] rounded-[10px] text-[#f3ead8] font-[family-name:var(--font-grotesk)] text-base px-3.5 py-[13px] outline-none transition-colors placeholder:text-[#6e6656] focus:border-[#d94a2b]'
const labelCls = 'block font-semibold text-[13.5px] mb-[7px] text-[#f3ead8]'
const errorCls = 'text-[#e07a5c] text-sm mt-1.5'

export function MobileLoginHero() {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const { signIn: googleSignIn, loading: googleLoading } = useGoogleSignIn()

  const { register, handleSubmit, setFocus, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  function openSheet() {
    setOpen(true)
    // Foco en el email recién terminada la transición del sheet (.34s) — enfocar antes lo pisa el
    // reflow del translate. Solo corre en mobile: en desktop el botón está oculto y nunca se dispara.
    setTimeout(() => setFocus('email'), 380)
  }

  // Cerrar con Escape mientras el sheet está abierto (design system §UI/UX modales). El click fuera lo
  // cubre el scrim. En desktop `open` nunca es true (el hero está display:none) → listener inerte.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Aviso de fallo de OAuth (vuelve como ?error=oauth). Se lee con window.location (no useSearchParams)
  // para no arrastrar el boundary de Suspense; el matchMedia gatea al viewport mobile real para no
  // duplicar el aviso del form desktop, que ya muestra su propio banner y también monta en este árbol.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('error') !== 'oauth') return
    if (window.matchMedia('(max-width: 759px)').matches) {
      toast.error('No pudimos entrar con Google. Probá de nuevo, o entrá con tu email y contraseña.')
    }
  }, [])

  async function onSubmit(data: FormData) {
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    })
    if (error) {
      toast.error('Email o contraseña incorrectos')
      setLoading(false)
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="fixed inset-0 z-40 overflow-hidden bg-[#141110] font-[family-name:var(--font-grotesk)] text-[#f3ead8] min-[760px]:hidden">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <header
        inert={open}
        className="absolute inset-0 flex flex-col"
        style={{ padding: '22px 24px calc(24px + env(safe-area-inset-bottom))' }}
      >
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 430 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <circle cx="400" cy="60" r="80" fill="#d94a2b" fillOpacity=".14" />
          <rect x="290" y="300" width="90" height="90" fill="#d94a2b" fillOpacity=".10" />
          <rect x="120" y="200" width="42" height="42" fill="rgba(243,234,216,.08)" />
          <path d="M30 560 L140 560 L140 670 Z" fill="#d94a2b" fillOpacity=".10" />
          <circle cx="60" cy="380" r="26" fill="rgba(243,234,216,.06)" />
        </svg>

        {/* Marca */}
        <div className="relative flex items-center justify-center gap-2.5">
          <svg width="38" height="48" viewBox="0 0 64 80" aria-hidden="true">
            <rect x="6" y="6" width="14" height="68" fill="#f3ead8" />
            <rect x="20" y="6" width="38" height="14" fill="#d94a2b" />
            <path d="M 20 34 L 50 34 L 36 48 L 20 48 Z" fill="#7aa6d6" />
            <path d="M 6 6 L 58 6 L 58 8 A 5 5 0 0 1 58 18 L 58 20 L 20 20 L 20 34 L 50 34 L 36 48 L 20 48 L 20 74 L 6 74 Z" fill="none" stroke="#1a1714" strokeWidth="0.5" strokeLinejoin="miter" />
            <circle cx="58" cy="13" r="5" fill="#f4c543" />
          </svg>
          <span className="font-[family-name:var(--font-archivo)] text-[23px] font-bold tracking-[-.02em]">
            forjo <span className="font-normal opacity-75">| gestión</span>
          </span>
        </div>

        {/* Cuerpo */}
        <div className="relative mt-auto">
          <h1 className="max-w-[11ch] font-[family-name:var(--font-archivo)] text-[clamp(30px,8.5vw,38px)] font-black uppercase leading-[1.02] tracking-[-.03em]">
            Tu agenda, clientes y finanzas en un solo lugar.
          </h1>
          <p className="mb-[26px] mt-3 text-[15px] opacity-85">Gestioná tu negocio desde el celular</p>
          <div className="flex flex-col gap-[11px]">
            <button type="button" onClick={openSheet} className={`${pill} bg-[#d94a2b] text-[#fff7ee] active:bg-[#c23f22]`}>
              Iniciar sesión
            </button>
            <Link href="/register" className={`${pill} border-[1.5px] border-[rgba(243,234,216,.35)] bg-transparent text-[#f3ead8] active:bg-[rgba(243,234,216,.10)]`}>
              Crear cuenta
            </Link>
            <button
              type="button"
              onClick={googleSignIn}
              disabled={googleLoading}
              className={`${pill} border border-[#332d24] bg-[#1c1815] text-[#f3ead8] active:bg-[#241f1a]`}
            >
              <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.4 17.7 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17.5z" />
                <path fill="#FBBC05" d="M10.4 28.7A14.4 14.4 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8z" />
                <path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.5-5.8c-2.1 1.4-4.7 2.2-7.7 2.2-6.3 0-11.7-3.9-13.6-9.4l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
              </svg>
              Continuar con Google
            </button>
          </div>
        </div>
      </header>

      {/* ── Scrim ────────────────────────────────────────────── */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden="true"
        className="absolute inset-0 bg-[rgba(13,11,9,.45)]"
        style={{ opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition: 'opacity .28s' }}
      />

      {/* ── Bottom sheet ─────────────────────────────────────── */}
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="m-login-title"
        inert={!open}
        className="absolute inset-x-0 bottom-0 overflow-y-auto rounded-t-[20px] border-t border-[#332d24] bg-[#1a1613]"
        style={{
          maxHeight: '88dvh',
          padding: '12px 24px calc(28px + env(safe-area-inset-bottom))',
          transform: open ? 'translateY(0)' : 'translateY(105%)',
          transition: 'transform .34s cubic-bezier(.32,.72,.25,1)',
        }}
      >
        <div className="mx-auto mb-[22px] h-1 w-10 rounded-full bg-[#332d24]" />
        <h2 id="m-login-title" className="font-[family-name:var(--font-archivo)] text-2xl font-extrabold tracking-[-.02em] text-[#f3ead8]">
          Iniciá sesión
        </h2>
        <p className="mb-6 mt-1.5 text-sm text-[#a39989]">Entrá a tu panel de Forjo Gestión</p>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="mb-4">
            <label htmlFor="m-login-email" className={labelCls}>Email</label>
            <input
              id="m-login-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="tu@email.com"
              className={inputCls}
              {...register('email')}
            />
            {errors.email && <p className={errorCls}>{errors.email.message}</p>}
          </div>
          <div className="mb-4">
            <label htmlFor="m-login-pwd" className={labelCls}>Contraseña</label>
            <div className="relative">
              <input
                id="m-login-pwd"
                type={showPwd ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                className={`${inputCls} pr-[46px]`}
                {...register('password')}
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                aria-label={showPwd ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                aria-pressed={showPwd}
                className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-[#a39989] transition-colors hover:text-[#f3ead8]"
              >
                {showPwd ? <EyeOff className="size-[19px]" aria-hidden="true" /> : <Eye className="size-[19px]" aria-hidden="true" />}
              </button>
            </div>
            {errors.password && <p className={errorCls}>{errors.password.message}</p>}
          </div>
          <button
            type="submit"
            disabled={loading}
            className="mt-1.5 min-h-12 w-full rounded-[10px] bg-[#d94a2b] font-[family-name:var(--font-grotesk)] text-[15px] font-semibold text-white transition-colors active:bg-[#c23f22] disabled:opacity-60"
          >
            {loading ? 'Ingresando...' : 'Entrar'}
          </button>
        </form>

        <div className="mt-5 flex flex-col gap-[13px] text-center">
          <Link href="/forgot-password" className="inline-block py-1 text-sm font-semibold text-[#d94a2b] hover:text-[#c23f22]">
            ¿Olvidaste tu contraseña?
          </Link>
          <span className="text-sm text-[#a39989]">
            ¿No tenés cuenta?{' '}
            <Link href="/register" className="font-semibold text-[#d94a2b] hover:text-[#c23f22]">Creá tu negocio</Link>
          </span>
        </div>
      </section>
    </div>
  )
}
