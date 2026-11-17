import { ExternalLink, X } from 'lucide-react'
import { cn } from '../../components/ui/cn'

export interface DestinoPantalla {
  ruta: string
  titulo: string
}

interface Props {
  destino: DestinoPantalla
  /** Modo tele: panel flotante al costado de la red */
  tele: boolean
  onCerrar: () => void
  onAbrir: () => void
}

/**
 * Una pantalla del hub abierta por Jarvis ("mostrame la carpeta de Nova"), como panel sobre la red.
 * Es el mismo hub dentro de un iframe (mismo sitio, misma sesión), que se muestra sin menú.
 */
export function PanelPantalla({ destino, tele, onCerrar, onAbrir }: Props) {
  return (
    <div
      className={cn(
        'absolute z-20 flex flex-col overflow-hidden rounded-2xl border border-acento/40 bg-fondo/95 shadow-[0_0_60px_-15px_var(--color-acento)] backdrop-blur animate-aparecer',
        tele ? 'inset-x-2 top-24 bottom-44 md:inset-x-auto md:top-[12%] md:right-6 md:bottom-[16%] md:w-[min(52%,920px)]' : 'inset-3 md:inset-6',
      )}
    >
      <div className="flex items-center gap-2 border-b border-acento/25 px-3 py-2">
        <span className="size-1.5 rounded-full bg-acento shadow-[0_0_8px_var(--color-acento)]" />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold tracking-[0.15em] text-acento-claro uppercase">{destino.titulo}</span>
        <button
          onClick={onAbrir}
          className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-acento-texto hover:bg-elevada"
          title="Abrir esta pantalla"
        >
          <ExternalLink className="size-3.5" /> Abrir
        </button>
        <button onClick={onCerrar} className="grid size-8 cursor-pointer place-items-center rounded-lg text-suave hover:bg-elevada hover:text-texto" aria-label="Cerrar panel">
          <X className="size-4" />
        </button>
      </div>
      <iframe key={destino.ruta} src={destino.ruta} title={destino.titulo} className="min-h-0 w-full flex-1 bg-fondo" />
    </div>
  )
}
