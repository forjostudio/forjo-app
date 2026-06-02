import Link from 'next/link'
import { Check } from 'lucide-react'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function PagoExitoso({ params }: Props) {
  const { slug } = await params

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#1a1714' }}>
      <div className="text-center max-w-sm">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{ backgroundColor: 'var(--primary-color)' }}
        >
          <Check className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">¡Turno confirmado!</h1>
        <p className="text-gray-400 mb-6">Tu seña fue recibida. Te esperamos.</p>
        <Link
          href={`/${slug}`}
          className="text-sm text-gray-400 hover:text-white transition-colors underline"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  )
}
