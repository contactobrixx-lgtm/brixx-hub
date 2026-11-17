import { useState, type FormEvent } from 'react'
import { Check, Copy, Rocket, Square, Volume2, X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Field'
import { cn } from '../../components/ui/cn'
import type { AgenteMision, Mision } from './useMisiones'

const ESTADO: Record<Mision['estado'], string> = {
  planificando: 'Armando el equipo…',
  trabajando: 'Trabajando',
  combinando: 'Juntando resultados…',
  lista: 'Lista',
  error: 'Con error',
  cancelada: 'Cancelada',
}

const colorBarra = (a: AgenteMision) => (a.estado === 'listo' ? 'bg-turquesa' : a.estado === 'error' ? 'bg-peligro' : 'bg-acento')

/** Los agentes de la misión con su avance y lo último que hicieron. */
export function ListaAgentes({ agentes, compacta = false }: { agentes: AgenteMision[]; compacta?: boolean }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {agentes.map((a) => {
        const ultimo = a.registro[a.registro.length - 1]?.texto
        return (
          <li key={a.id}>
            <div className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{a.nombre}</span>
              <span className={cn('tabular text-xs', a.estado === 'error' ? 'text-peligro' : a.estado === 'listo' ? 'text-turquesa' : 'text-tenue')}>
                {a.estado === 'listo' ? 'listo' : a.estado === 'error' ? 'no terminó' : `${a.progreso}%`}
              </span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-elevada">
              <div className={cn('h-full rounded-full transition-all duration-700', colorBarra(a))} style={{ width: `${Math.max(4, a.progreso)}%` }} />
            </div>
            {!compacta && ultimo && <p className="mt-1 truncate text-xs text-tenue">{ultimo}</p>}
          </li>
        )
      })}
    </ul>
  )
}

/** Lo que van haciendo todos los agentes, lo más nuevo arriba (para el modo tele). */
export function RegistroMision({ agentes }: { agentes: AgenteMision[] }) {
  const lineas = agentes
    .flatMap((a) => a.registro.map((r) => ({ ...r, quien: a.nombre })))
    .sort((x, y) => y.t.localeCompare(x.t))
    .slice(0, 9)
  if (!lineas.length) return <p className="text-sm text-tenue">Armando el equipo…</p>
  return (
    <ul className="flex flex-col gap-1.5">
      {lineas.map((l, i) => (
        <li key={`${l.t}-${i}`} className="text-xs leading-snug">
          <span className="tabular text-tenue">{new Date(l.t).toLocaleTimeString('es-AR', { hour12: false })} </span>
          <span className="font-semibold text-acento-claro">{l.quien}</span> <span className="text-suave">{l.texto}</span>
        </li>
      ))}
    </ul>
  )
}

/** El resultado combinado de la misión, con escuchar y copiar. */
export function ResultadoMision({ mision, onEscuchar }: { mision: Mision; onEscuchar?: (texto: string) => void }) {
  const [copiado, setCopiado] = useState(false)
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(`${mision.titulo ?? ''}\n\n${mision.resultado ?? ''}`)
      setCopiado(true)
      window.setTimeout(() => setCopiado(false), 2000)
    } catch {
      /* sin permiso de portapapeles */
    }
  }
  return (
    <div className="flex min-h-0 flex-col gap-2">
      {mision.resumen && <p className="font-semibold leading-snug">{mision.resumen}</p>}
      <div className="min-h-0 overflow-y-auto rounded-xl bg-elevada/70 p-3 text-sm leading-relaxed whitespace-pre-line text-suave">{mision.resultado}</div>
      <div className="flex flex-wrap gap-2">
        {onEscuchar && mision.resumen && (
          <Button size="sm" variant="secundario" onClick={() => onEscuchar(mision.resumen!)}>
            <Volume2 className="size-4" /> Escuchar
          </Button>
        )}
        <Button size="sm" variant="secundario" onClick={copiar}>
          {copiado ? <Check className="size-4" /> : <Copy className="size-4" />} {copiado ? 'Copiado' : 'Copiar'}
        </Button>
      </div>
    </div>
  )
}

interface Props {
  mision: Mision | null
  agentes: AgenteMision[]
  activa: boolean
  onCrear: (pedido: string) => Promise<void>
  onCancelar: () => Promise<void>
  onOcultar: () => void
  onEscuchar?: (texto: string) => void
}

/** Panel de misiones en /jarvis: lanzar una, seguir el avance de los agentes y ver el resultado. */
export function PanelMision({ mision, agentes, activa, onCrear, onCancelar, onOcultar, onEscuchar }: Props) {
  const [pedido, setPedido] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lanzar = async (e: FormEvent) => {
    e.preventDefault()
    if (!pedido.trim()) return
    setEnviando(true)
    setError(null)
    try {
      await onCrear(pedido.trim())
      setPedido('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo lanzar.')
    } finally {
      setEnviando(false)
    }
  }

  if (!mision) {
    return (
      <form onSubmit={lanzar} className="flex flex-col gap-2">
        <p className="text-sm text-tenue">
          Para algo grande, un equipo de agentes lo trabaja en paralelo. Por ejemplo: "prepará la reunión con Nova" o "buscá 10 inmobiliarias de Rosario y armales
          un mensaje". También se lo podés pedir a Jarvis por voz.
        </p>
        <div className="flex gap-2">
          <Input value={pedido} onChange={(e) => setPedido(e.target.value)} placeholder="¿Qué misión le damos al equipo?" maxLength={2000} />
          <Button type="submit" disabled={enviando || !pedido.trim()}>
            <Rocket className="size-4" /> {enviando ? 'Lanzando…' : 'Lanzar'}
          </Button>
        </div>
        {error && <p className="text-sm text-peligro">{error}</p>}
      </form>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-snug">{mision.titulo ?? mision.pedido}</p>
          <p className={cn('text-xs', mision.estado === 'error' ? 'text-peligro' : mision.estado === 'lista' ? 'text-turquesa' : 'text-acento-claro')}>
            {ESTADO[mision.estado]}
            {agentes.length ? ` · ${agentes.length} agentes` : ''}
          </p>
        </div>
        {activa ? (
          <Button size="sm" variant="fantasma" onClick={onCancelar}>
            <Square className="size-3.5" /> Frenar
          </Button>
        ) : (
          <button onClick={onOcultar} className="grid size-8 cursor-pointer place-items-center rounded-lg text-tenue hover:bg-elevada hover:text-texto" aria-label="Cerrar misión">
            <X className="size-4" />
          </button>
        )}
      </div>
      {agentes.length > 0 && <ListaAgentes agentes={agentes} compacta={mision.estado === 'lista'} />}
      {mision.estado === 'lista' && <ResultadoMision mision={mision} onEscuchar={onEscuchar} />}
      {mision.estado === 'error' && <p className="text-sm text-peligro">{mision.error}</p>}
    </div>
  )
}
