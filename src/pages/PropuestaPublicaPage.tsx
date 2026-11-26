import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Download } from 'lucide-react'
import { PropuestaImprimible } from '../features/cotizador/PropuestaImprimible'
import { usePropuestaPublica, useVideoPropuestaPublica } from '../features/cotizador/useCotizador'
import { Button } from '../components/ui/Button'
import { PantallaCarga } from '../components/ui/Spinner'

/**
 * /p/:token — la propuesta que se le manda al cliente: se abre sin iniciar sesión (link de WhatsApp),
 * con todas las hojas y el video andando. Desde la compu se puede guardar como PDF.
 */
export function PropuestaPublicaPage() {
  const { token } = useParams()
  const { cotizacion: c, cargando } = usePropuestaPublica(token)
  const videoHub = useVideoPropuestaPublica(c ? token : undefined, !!c?.video_url)

  useEffect(() => {
    // Que no aparezca en buscadores
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])

  useEffect(() => {
    const cliente = c?.prospectos?.empresa || c?.prospectos?.nombre
    if (cliente) document.title = `Propuesta para ${cliente} · brixx`
  }, [c])

  if (cargando) return <PantallaCarga />
  if (!c)
    return (
      <div className="grid min-h-dvh place-items-center bg-fondo p-6 text-center">
        <div>
          <p className="text-lg font-semibold">Esta propuesta no está disponible.</p>
          <p className="mt-1 text-sm text-tenue">Puede que el link haya cambiado. Pedile uno nuevo a quien te la mandó.</p>
        </div>
      </div>
    )

  return (
    <div className="min-h-dvh bg-elevada py-6 print:bg-papel print:py-0">
      <div className="no-print mx-auto mb-4 hidden max-w-[210mm] justify-end gap-2 px-4 md:flex">
        <Button onClick={() => window.print()}>
          <Download className="size-[18px]" /> Descargar PDF
        </Button>
      </div>
      <PropuestaImprimible c={c} videoHub={videoHub} />
    </div>
  )
}
