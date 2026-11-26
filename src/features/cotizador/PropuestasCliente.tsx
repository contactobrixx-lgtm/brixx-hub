import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, FileText, Link2, Pencil, Plus } from 'lucide-react'
import type { Cotizacion } from '../../types/db'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { ErrorBox } from '../../components/ui/ErrorBox'
import { ESTADO_COTIZACION_LABEL, formatFecha, formatMonto, numeroCotizacion } from '../../lib/format'
import { totalesCotizacion } from '../finanzas/calculos'
import { linkPublicoPropuesta, usePropuestasCliente } from './useCotizador'

export const TONO_ESTADO_COTIZACION = { borrador: 'neutro', enviada: 'acento', aceptada: 'ok', rechazada: 'peligro' } as const

/** Bloque "Propuestas" de la carpeta del cliente: sus cotizaciones con ver, link para el cliente y editar */
export function PropuestasCliente({ prospectoId, nombre }: { prospectoId: string; nombre: string }) {
  const navigate = useNavigate()
  const { propuestas, cargando, error } = usePropuestasCliente(prospectoId)
  const [copiado, setCopiado] = useState<string | null>(null)
  const [errorLink, setErrorLink] = useState<string | null>(null)

  const compartir = async (c: Cotizacion) => {
    setErrorLink(null)
    try {
      const url = await linkPublicoPropuesta(c.id, c.token_publico)
      const titulo = `Propuesta para ${nombre}`
      if (navigator.share) await navigator.share({ title: titulo, text: `${titulo} · brixx`, url }).catch(() => {})
      else await navigator.clipboard?.writeText(url).catch(() => {})
      setCopiado(c.id)
      setTimeout(() => setCopiado(null), 2500)
    } catch (e) {
      setErrorLink(e instanceof Error ? e.message : 'No se pudo armar el link.')
    }
  }

  return (
    <section className="rounded-2xl border border-borde bg-superficie p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <FileText className="size-5 text-acento-texto" />
        <h2 className="min-w-0 flex-1 text-[19px] font-bold">Propuestas</h2>
        <Button size="sm" variant="secundario" onClick={() => navigate(`/propuestas?nueva=${prospectoId}`)}>
            <Plus className="size-4" /> Nueva
          </Button>
      </div>
      {(error || errorLink) && (
        <div className="mb-3">
          <ErrorBox mensaje={errorLink ?? error ?? ''} />
        </div>
      )}
      {cargando ? null : propuestas.length === 0 ? (
        <p className="text-sm text-tenue">Todavía no le armamos ninguna propuesta.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {propuestas.map((c) => {
            const t = totalesCotizacion(c)
            return (
              <li key={c.id} className="rounded-xl bg-elevada p-3.5">
                <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold leading-snug">{c.titulo || 'Propuesta'}</span>
                    <span className="text-[13px] text-tenue">
                      {numeroCotizacion(c.numero)} · {formatFecha(c.fecha)}
                    </span>
                  </span>
                  <Badge tono={TONO_ESTADO_COTIZACION[c.estado]}>{ESTADO_COTIZACION_LABEL[c.estado]}</Badge>
                </div>
                <p className="tabular mt-1.5 text-sm">
                  <b className="font-semibold">{formatMonto(t.implementacion, c.moneda)}</b>
                  {t.mensual > 0 && <span className="text-tenue"> + {formatMonto(t.mensual, c.moneda)}/mes</span>}
                </p>
                <div className="-ml-2 mt-1.5 flex flex-wrap gap-1">
                  <Button size="sm" variant="fantasma" onClick={() => navigate(`/cotizaciones/${c.id}/imprimir`)}>
                      <FileText className="size-4" /> Ver
                    </Button>
                  <Button size="sm" variant="fantasma" onClick={() => compartir(c)} title="Link para mandarle la propuesta (se abre sin iniciar sesión)">
                    {copiado === c.id ? <Check className="size-4" /> : <Link2 className="size-4" />} {copiado === c.id ? 'Link listo' : 'Link para el cliente'}
                  </Button>
                  <Button size="sm" variant="fantasma" onClick={() => navigate(`/propuestas?abrir=${c.id}`)}>
                      <Pencil className="size-4" /> Editar
                    </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
