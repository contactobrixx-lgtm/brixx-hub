import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink, RotateCw } from 'lucide-react'
import { useFicha } from '../features/fichas/useFichas'
import { abrirEnPestana } from '../features/fichas/abrirFicha'
import { Button } from '../components/ui/Button'
import { PantallaCarga, Spinner } from '../components/ui/Spinner'

export function VisorPage() {
  const { id } = useParams()
  const { ficha, cargando } = useFicha(id)
  const [cargado, setCargado] = useState(false)
  const [version, setVersion] = useState(0)

  if (cargando) return <PantallaCarga />
  if (!ficha) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-sm text-suave">
        No se encontró la ficha.
        <Link to="/sistemas" className="text-acento hover:underline">
          Volver al hub
        </Link>
      </div>
    )
  }

  const volver = ficha.seccion === 'sistema' ? '/sistemas' : '/demos'

  return (
    <div className="flex h-full flex-col bg-fondo">
      <header className="flex items-center gap-2 border-b border-borde bg-superficie px-3 py-2">
        <Link
          to={volver}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-suave hover:bg-hover hover:text-texto"
        >
          <ArrowLeft className="size-4" />
          <span className="hidden sm:inline">Hub</span>
        </Link>
        <div className="mx-1 h-5 w-px bg-borde" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{ficha.nombre}</div>
          <div className="hidden truncate text-[11px] text-tenue sm:block">
            ¿No carga? Algunas apps bloquean verse embebidas: abrila en pestaña nueva.
          </div>
        </div>
        <Button
          variant="fantasma"
          size="icono"
          onClick={() => {
            setCargado(false)
            setVersion((v) => v + 1)
          }}
          aria-label="Recargar"
          title="Recargar"
        >
          <RotateCw className="size-4" />
        </Button>
        <Button variant="secundario" size="sm" onClick={() => abrirEnPestana(ficha.url)}>
          <ExternalLink className="size-3.5" />
          <span className="hidden sm:inline">Pestaña nueva</span>
        </Button>
      </header>
      <div className="relative flex-1">
        {!cargado && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Spinner />
          </div>
        )}
        <iframe
          key={version}
          src={ficha.url}
          title={ficha.nombre}
          onLoad={() => setCargado(true)}
          className="absolute inset-0 size-full border-0 bg-white"
          allow="clipboard-read; clipboard-write; fullscreen; camera; microphone; geolocation"
        />
      </div>
    </div>
  )
}
