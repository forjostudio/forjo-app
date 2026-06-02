import Link from 'next/link'
import { XCircle } from 'lucide-react'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function PagoFallido({ params }: Props) {
  const { slug } = await params

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#1a1714' }}>
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-red-500/20">
          <XCircle className="w-8 h-8 text-red-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">El pago no se completó</h1>
        <p className="text-gray-400 mb-6">Por favor intentá de nuevo o elegí otro método.</p>
        <Link
          href={`/${slug}`}
          className="text-sm text-gray-400 hover:text-white transition-colors underline"
        >
          Volver e intentar de nuevo
        </Link>
      </div>
    </div>
  )
}
