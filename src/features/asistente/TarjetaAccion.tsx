import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, CircleAlert, X } from 'lucide-react'
import type { AccionJarvis } from '../../types/db'
import { Button } from '../../components/ui/Button'
import { cn } from '../../components/ui/cn'

interface Props {
  accion: AccionJarvis
  onResolver: (id: string, que: 'confirmar' | 'cancelar') => Promise<unknown>
  compacta?: boolean
}

/** Una acción que preparó Jarvis: se confirma o se cancela acá (o diciéndole "sí, dale"). */
export function TarjetaAccion({ accion: a, onResolver, compacta = false }: Props) {
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resolver = async (que: 'confirmar' | 'cancelar') => {
    setOcupado(true)
    setError(null)
    try {
      await onResolver(a.id, que)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo.')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div
      className={cn(
        'rounded-xl border p-3 text-sm',
        a.estado === 'pendiente' ? 'border-acento/50 bg-acento-tenue/40' : 'border-borde bg-elevada',
        compacta && 'p-2.5',
      )}
    >
      <p className={cn('leading-snug', a.estado === 'cancelada' && 'text-tenue line-through')}>{a.resumen}</p>
      {a.estado === 'pendiente' ? (
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => resolver('confirmar')} disabled={ocupado}>
            <Check className="size-4" /> {ocupado ? 'Haciendo…' : 'Confirmar'}
          </Button>
          <Button size="sm" variant="fantasma" onClick={() => resolver('cancelar')} disabled={ocupado}>
            <X className="size-4" /> Cancelar
          </Button>
        </div>
      ) : (
        <p className={cn('mt-1.5 flex items-center gap-1.5 text-[13px]', a.estado === 'hecha' ? 'text-ok' : a.estado === 'error' ? 'text-peligro' : 'text-tenue')}>
          {a.estado === 'hecha' ? <Check className="size-3.5" /> : a.estado === 'error' ? <CircleAlert className="size-3.5" /> : null}
          <span className="min-w-0 flex-1">{a.resultado ?? (a.estado === 'cancelada' ? 'Cancelada.' : '')}</span>
          {a.estado === 'hecha' && a.link && (
            <Link to={a.link} className="font-semibold text-acento-texto hover:underline">
              Ver
            </Link>
          )}
        </p>
      )}
      {error && <p className="mt-1.5 text-[13px] text-peligro">{error}</p>}
    </div>
  )
}
