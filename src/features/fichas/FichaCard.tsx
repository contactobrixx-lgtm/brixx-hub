import { useNavigate } from 'react-router-dom'
import { ExternalLink, Pencil } from 'lucide-react'
import type { Ficha } from '../../types/db'
import { Badge } from '../../components/ui/Badge'
import { ESTADO_LABEL, iniciales } from '../../lib/format'
import { cn } from '../../components/ui/cn'
import { abrirEnPestana, abrirFicha } from './abrirFicha'
import { PreviewSitio } from './PreviewSitio'

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
        'group relative flex flex-col overflow-hidden rounded-2xl border border-borde bg-superficie transition-colors duration-150',
        'hover:border-borde-fuerte',
        archivada && 'opacity-60',
      )}
    >
      {/* Portada: captura cargada > vista previa en vivo > iniciales */}
      <div className="relative m-2 mb-0 aspect-[16/9] overflow-hidden rounded-xl bg-elevada">
        <div className="flex size-full items-center justify-center bg-gradient-to-br from-acento-tenue to-elevada">
          <span className="font-display text-4xl font-bold text-acento-claro/80">{iniciales(ficha.nombre)}</span>
        </div>
        {imagenUrl ? (
          <img
            src={imagenUrl}
            alt=""
            loading="lazy"
            className="absolute inset-0 size-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          ficha.modo_apertura === 'iframe' && <PreviewSitio url={ficha.url} />
        )}
        <button
          onClick={() => abrirFicha(ficha, navigate)}
          className="absolute inset-0 cursor-pointer"
          aria-label={`Abrir ${ficha.nombre}`}
        />
        <div className="pointer-events-none absolute top-3 left-3 flex gap-1.5">
          {ficha.categoria && <Badge className="bg-fondo/85 text-texto backdrop-blur">{ficha.categoria}</Badge>}
          {ficha.estado !== 'activo' && (
            <Badge tono={ficha.estado === 'en_desarrollo' ? 'aviso' : 'neutro'}>
              {ESTADO_LABEL[ficha.estado]}
            </Badge>
          )}
        </div>
      </div>

      {/* Acciones rápidas */}
      <div className="absolute top-5 right-5 flex gap-1.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
        <button
          onClick={() => abrirEnPestana(ficha.url)}
          className="grid size-9 cursor-pointer place-items-center rounded-[10px] border border-borde-fuerte bg-fondo/85 text-suave backdrop-blur hover:text-texto"
          aria-label="Abrir en pestaña nueva"
          title="Abrir en pestaña nueva"
        >
          <ExternalLink className="size-3.5" />
        </button>
        <button
          onClick={onEditar}
          className="grid size-9 cursor-pointer place-items-center rounded-[10px] border border-borde-fuerte bg-fondo/85 text-suave backdrop-blur hover:text-texto"
          aria-label="Editar ficha"
          title="Editar"
        >
          <Pencil className="size-3.5" />
        </button>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-[19px] leading-snug font-bold">{ficha.nombre}</h3>
        {ficha.cliente && <p className="mt-0.5 text-sm font-medium text-acento-texto">{ficha.cliente}</p>}
        {ficha.descripcion && <p className="mt-2 line-clamp-2 text-sm text-tenue">{ficha.descripcion}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-4">
          {ficha.etiquetas.map((t) => (
            <span key={t} className="text-xs text-tenue">
              #{t}
            </span>
          ))}
          <span className="ml-auto truncate text-xs text-tenue">{dominio(ficha.url)}</span>
        </div>
      </div>
    </article>
  )
}
