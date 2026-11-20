import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, RotateCw, Trash2 } from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { ErrorBox } from '../components/ui/ErrorBox'
import { PantallaCarga } from '../components/ui/Spinner'
import { ReproductorVideo } from '../features/videos/ReproductorVideo'
import { ESTADO_VIDEO } from '../features/videos/VideosCliente'
import { colgado, reintentarVideo, useVideo, useVideos } from '../features/videos/useVideos'

/** /videos/:id — el video explicativo: se arma, se mira y se descarga. */
export function VideoPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { video: v, cargando, error, recargar } = useVideo(id)
  const { borrar } = useVideos({})
  const [ocupado, setOcupado] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const [errorAccion, setErrorAccion] = useState<string | null>(null)

  if (cargando) return <PantallaCarga />
  if (!v) return <p className="p-10 text-center text-tenue">{error ?? 'No se encontró el video.'}</p>

  const cortado = colgado(v)
  const armando = (v.estado === 'guion' || v.estado === 'voz') && !cortado
  const volver = v.grabacion_id ? `/grabaciones/${v.grabacion_id}` : v.prospecto_id ? `/clientes/${v.prospecto_id}` : '/clientes'

  const reintentar = async () => {
    setOcupado(true)
    setErrorAccion(null)
    try {
      await reintentarVideo(v.id)
      setTimeout(recargar, 800)
    } catch (e) {
      setErrorAccion(e instanceof Error ? e.message : 'No se pudo reintentar.')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pt-6 pb-16 md:px-10 md:pt-8">
      <Link to={volver} className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-acento-texto hover:underline">
        <ArrowLeft className="size-4" /> Volver
      </Link>
      <header className="mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tono={cortado ? 'peligro' : ESTADO_VIDEO[v.estado].tono}>{cortado ? 'Se cortó' : ESTADO_VIDEO[v.estado].label}</Badge>
          {v.estado === 'listo' && !v.con_voz && <Badge>Sin voz</Badge>}
          <span className="text-sm text-tenue">{new Date(v.created_at).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
        </div>
        <h1 className="mt-2 text-[26px] leading-tight font-bold sm:text-[32px]">{v.titulo}</h1>
      </header>

      {armando && (
        <div className="mb-5 flex items-center gap-3 rounded-2xl border border-borde bg-superficie p-4">
          <Loader2 className="size-6 animate-spin text-acento-texto" />
          <div>
            <p className="font-semibold">{v.estado === 'guion' ? 'Claude está escribiendo el guion…' : 'Poniéndole la voz a cada escena…'}</p>
            <p className="text-sm text-tenue">Tarda uno o dos minutos. Podés salir: queda en la carpeta del cliente.</p>
          </div>
        </div>
      )}
      {(v.estado === 'error' || cortado) && (
        <div className="mb-5 space-y-3">
          <ErrorBox mensaje={v.error ?? 'El video se cortó antes de terminar.'} />
          <Button variant="secundario" onClick={reintentar} disabled={ocupado}>
            <RotateCw className="size-4" /> Reintentar
          </Button>
        </div>
      )}
      {errorAccion && (
        <div className="mb-5">
          <ErrorBox mensaje={errorAccion} />
        </div>
      )}

      {v.estado === 'listo' && v.guion && <ReproductorVideo key={v.updated_at} video={v} />}

      {v.guion && (
        <details className="mt-6 rounded-2xl border border-borde bg-superficie p-4">
          <summary className="cursor-pointer font-semibold">Guion ({v.guion.escenas.length} escenas)</summary>
          <ol className="mt-3 flex flex-col gap-3 text-sm">
            {v.guion.escenas.map((e, i) => (
              <li key={i} className="rounded-xl bg-elevada p-3">
                <span className="text-xs font-semibold tracking-wide text-acento-texto uppercase">
                  {i + 1}. {e.tipo}
                  {e.vista === 'equipo' ? ' · lado del dueño' : ''}
                  {e.titulo ? ` · ${e.titulo}` : ''}
                </span>
                <p className="mt-1 text-suave">{e.narracion}</p>
                {(e.cambios ?? []).length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1 text-[13px] text-tenue">
                    {(e.cambios ?? []).map((c, k) => (
                      <li key={k}>
                        <b className="text-suave">
                          {c.columna} {c.hora}:
                        </b>{' '}
                        {c.nota}
                      </li>
                    ))}
                  </ul>
                )}
                {e.mensajes.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1 text-[13px] text-tenue">
                    {e.mensajes.map((m, k) => (
                      <li key={k}>
                        <b className="text-suave">{m.de === 'cliente' ? (e.contacto ?? 'Cliente') : m.de === 'bot' ? 'Asistente' : m.de === 'persona' ? 'Equipo' : '—'}:</b> {m.texto}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}

      <div className="mt-8 border-t border-borde pt-4">
        <Button
          size="sm"
          variant={confirmar ? 'peligro' : 'fantasma'}
          onClick={() => (confirmar ? borrar(v).then(() => navigate(volver)) : setConfirmar(true))}
        >
          <Trash2 className="size-4" /> {confirmar ? '¿Seguro? Borrar video' : 'Borrar video'}
        </Button>
      </div>
    </div>
  )
}
