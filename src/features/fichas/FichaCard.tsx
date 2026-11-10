import { useNavigate } from 'react-router-dom'
import { ExternalLink, Pencil } from 'lucide-react'
import type { Ficha } from '../../types/db'
import { Badge } from '../../components/ui/Badge'
import { ESTADO_LABEL, iniciales } from '../../lib/format'
import { cn } from '../../components/ui/cn'
import { abrirEnPestana, abrirFicha } from './abrirFicha'

interface Props {
  ficha: Ficha
  imagenUrl?: string
  onEditar: () => void
}

function dominio(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function FichaCard({ ficha, imagenUrl, onEditar }: Props) {
  const navigate = useNavigate()
  const archivada = ficha.estado === 'archivado'

  return (
    <article
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl border border-borde bg-superficie transition-all duration-200',
        'hover:-translate-y-0.5 hover:border-borde-fuerte hover:shadow-[0_20px_40px_-20px_rgb(0_0_0/0.8),0_0_0_1px_rgb(167_139_250/0.08)]',
        archivada && 'opacity-60',
      )}
    >
      {/* Portada */}
      <button
        onClick={() => abrirFicha(ficha, navigate)}
        className="relative block aspect-[16/9] w-full cursor-pointer overflow-hidden bg-elevada"
        aria-label={`Abrir ${ficha.nombre}`}
      >
        {imagenUrl ? (
          <img
            src={imagenUrl}
            alt=""
            loading="lazy"
            className="size-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-[radial-gradient(circle_at_30%_20%,rgb(167_139_250/0.18),transparent_60%)]">
            <span className="text-3xl font-semibold tracking-tight text-acento/70">{iniciales(ficha.nombre)}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-superficie/90 via-transparent to-transparent" />
        <div className="absolute top-3 left-3 flex gap-1.5">
          {ficha.categoria && <Badge className="bg-fondo/80 backdrop-blur">{ficha.categoria}</Badge>}
          {ficha.estado !== 'activo' && (
            <Badge tono={ficha.estado === 'en_desarrollo' ? 'aviso' : 'neutro'} className="backdrop-blur">
              {ESTADO_LABEL[ficha.estado]}
            </Badge>
          )}
        </div>
      </button>

      {/* Acciones rápidas */}
      <div className="absolute top-3 right-3 flex gap-1.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
        <button
          onClick={() => abrirEnPestana(ficha.url)}
          className="flex size-8 cursor-pointer items-center justify-center rounded-lg border border-borde bg-fondo/80 text-suave backdrop-blur hover:text-texto"
          aria-label="Abrir en pestaña nueva"
          title="Abrir en pestaña nueva"
        >
          <ExternalLink className="size-3.5" />
        </button>
        <button
          onClick={onEditar}
          className="flex size-8 cursor-pointer items-center justify-center rounded-lg border border-borde bg-fondo/80 text-suave backdrop-blur hover:text-texto"
          aria-label="Editar ficha"
          title="Editar"
        >
          <Pencil className="size-3.5" />
        </button>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-semibold leading-snug">{ficha.nombre}</h3>
        {ficha.cliente && <p className="mt-0.5 text-xs text-acento">{ficha.cliente}</p>}
        {ficha.descripcion && <p className="mt-2 line-clamp-2 text-sm text-suave">{ficha.descripcion}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-4">
          {ficha.etiquetas.map((t) => (
            <span key={t} className="text-[11px] text-tenue">
              #{t}
            </span>
          ))}
          <span className="ml-auto truncate text-[11px] text-tenue">{dominio(ficha.url)}</span>
        </div>
      </div>
    </article>
  )
}
