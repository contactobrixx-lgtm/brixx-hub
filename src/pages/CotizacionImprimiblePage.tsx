import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2, Printer, Sparkles } from 'lucide-react'
import { armarTextosPropuesta, sinTextosPropuesta, useCotizacionCompleta, useVideoPropuesta } from '../features/cotizador/useCotizador'
import { PropuestaImprimible } from '../features/cotizador/PropuestaImprimible'
import { Button } from '../components/ui/Button'
import { PantallaCarga } from '../components/ui/Spinner'

/**
 * La propuesta lista para imprimir o guardar como PDF: siempre con el formato de la propuesta de Alcione (hojas A4:
 * portada, video, punto de partida, servicios e inversión). Si le faltan los textos, Claude los escribe con la
 * carpeta del cliente la primera vez que se abre (sin tocar precios). El video es el link cargado o el último
 * video guardado del cliente.
 */
export function CotizacionImprimiblePage() {
  const { id } = useParams()
  const { cotizacion: c, cargando, error, recargar } = useCotizacionCompleta(id)
  const videoHub = useVideoPropuesta(c)
  const [escribiendo, setEscribiendo] = useState(false)
  const [errorTextos, setErrorTextos] = useState<string | null>(null)
  const pedido = useRef(false)
  const [confirmar, setConfirmar] = useState(false)

  const escribir = async () => {
    if (!c) return
    pedido.current = true
    setEscribiendo(true)
    setErrorTextos(null)
    try {
      await armarTextosPropuesta(c.id)
      await recargar()
    } catch (e) {
      setErrorTextos(e instanceof Error ? e.message : 'No se pudieron escribir los textos.')
    } finally {
      setEscribiendo(false)
    }
  }

  // La primera vez que se abre una propuesta sin textos, se escriben solos
  useEffect(() => {
    if (c && !pedido.current && sinTextosPropuesta(c) && c.cotizacion_items.length) escribir()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c])

  if (cargando) return <PantallaCarga />
  if (!c) return <p className="p-10 text-center text-tenue">{error ?? 'No se encontró la cotización.'}</p>

  return (
    <div className="min-h-full bg-elevada py-8 print:bg-papel print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-end gap-2 px-4">
        {escribiendo ? (
          <span className="mr-auto flex items-center gap-2 text-sm text-suave">
            <Loader2 className="size-4 animate-spin" /> Claude está escribiendo los textos con la carpeta del cliente (tarda un minuto)…
          </span>
        ) : (
          errorTextos && <span className="mr-auto text-sm text-peligro">{errorTextos}</span>
        )}
        <Button
          variant="secundario"
          onClick={() => {
            // Rehacer pisa los textos que ya tiene: se confirma con un segundo toque
            if (!sinTextosPropuesta(c) && !confirmar) return setConfirmar(true)
            setConfirmar(false)
            escribir()
          }}
          disabled={escribiendo}
          title="Reescribe los textos con la carpeta del cliente (no toca precios)"
        >
          <Sparkles className="size-[18px]" />{' '}
          {sinTextosPropuesta(c) ? 'Armar los textos' : confirmar ? 'Reemplaza los textos actuales: tocá de nuevo' : 'Rehacer los textos'}
        </Button>
        <Button onClick={() => window.print()} disabled={escribiendo}>
          <Printer className="size-[18px]" /> Imprimir / guardar PDF
        </Button>
      </div>
      <PropuestaImprimible c={c} videoHub={videoHub} />
    </div>
  )
}
