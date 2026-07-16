'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const schema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
})

type FormData = z.infer<typeof schema>

export default function LoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

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
    <div className="min-h-screen flex items-stretch bg-background text-foreground">
      {/* Panel izquierdo Bauhaus — bg-primary + formas geométricas (oculto en mobile) */}
      <div className="hidden md:flex flex-1 relative overflow-hidden bg-primary text-primary-foreground p-12 flex-col justify-between">
        <svg className="absolute inset-0 w-full h-full opacity-90" viewBox="0 0 500 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <circle cx="420" cy="120" r="90" fill="rgba(255,255,255,.10)" />
          <rect x="60" y="430" width="120" height="120" fill="rgba(0,0,0,.12)" />
          <path d="M360 480 L470 480 L470 590 Z" fill="rgba(255,255,255,.08)" />
          <rect x="300" y="300" width="50" height="50" fill="rgba(255,255,255,.12)" />
        </svg>
        {/* Variante crema FIJA, sin swap dark/light: el panel es siempre bg-primary (color saturado
            de marca), así que nunca hay fondo claro posible. */}
        <div className="relative">
          <Image src="/brand/forjo-gestion-lockup-crema.png" alt="Forjo Gestión" width={781} height={190} priority className="h-10 w-auto" />
        </div>
        <h2 className="relative font-[family-name:var(--font-heading)] font-black uppercase leading-none tracking-tight text-[clamp(30px,4vw,46px)]">
          Tu agenda,<br />clientes y<br />finanzas en<br />un solo lugar.
        </h2>
        {/* Crédito "hecho con Forjo Studio" — mismo copy/link que el footer de la página de reservas
            (app/[slug]/booking-client.tsx). El estilo NO se copia: aquel vive sobre fondo neutro y usa
            text-muted-foreground/foreground; acá el panel es bg-primary, así que va opacidad sobre
            primary-foreground. Sin la marca F del original: su rect rojo se pierde sobre el naranja. */}
        <p className="relative text-sm opacity-80">
          hecho con{' '}
          <a
            href="https://www.forjo.studio"
            target="_blank"
            rel="noopener noreferrer"
            className="font-[family-name:var(--font-archivo)] opacity-100 hover:opacity-80 transition-opacity"
          >
            <span className="font-semibold">Forjo</span> Studio
          </a>
        </p>
      </div>

      {/* Columna derecha — formulario */}
      <div className="w-full md:w-[440px] flex items-center justify-center p-8 sm:p-10">
        <div className="w-full max-w-[340px]">
          <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold">Iniciá sesión</h1>
          <p className="text-muted-foreground text-sm mt-1.5 mb-6">Entrá a tu panel de Forjo Gestión</p>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="tu@email.com"
                {...register('email')}
              />
              {errors.email && (
                <p className="text-destructive text-sm">{errors.email.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                {...register('password')}
              />
              {errors.password && (
                <p className="text-destructive text-sm">{errors.password.message}</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Ingresando...' : 'Entrar'}
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground mt-5">
            ¿No tenés cuenta?{' '}
            <Link href="/register" className="text-primary font-medium hover:underline">
              Creá tu negocio
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
