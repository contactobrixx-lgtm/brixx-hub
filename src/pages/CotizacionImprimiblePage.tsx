import { Play, Printer } from 'lucide-react'
import { useParams } from 'react-router-dom'
import type { CotizacionItem, Moneda } from '../types/db'
import { useCotizacionCompleta } from '../features/cotizador/useCotizador'
import { totalesCotizacion } from '../features/finanzas/calculos'
import { LogoMark } from '../components/layout/Logo'
import { Button } from '../components/ui/Button'
import { PantallaCarga } from '../components/ui/Spinner'
import { formatFechaLarga, formatMonto, numeroCotizacion } from '../lib/format'

/** Cómo mostrar el video de la propuesta: en pantalla se reproduce; en el PDF queda una imagen con el link. */
function videoDe(url: string): { tipo: 'iframe' | 'video' | 'enlace'; src: string; link: string; poster: string | null } {
  const abs = new URL(url, window.location.origin)
  const yt = /youtu\.be\/([\w-]{6,})|youtube\.com\/(?:watch\?v=|shorts\/|embed\/)([\w-]{6,})/.exec(url)
  if (yt) {
    const id = yt[1] ?? yt[2]
    return { tipo: 'iframe', src: `https://www.youtube.com/embed/${id}`, link: abs.href, poster: `https://img.youtube.com/vi/${id}/hqdefault.jpg` }
  }
  const propio = abs.origin === window.location.origin
  if (/\.mp4$/i.test(abs.pathname)) return { tipo: 'video', src: abs.href, link: abs.href, poster: propio ? abs.pathname.replace(/\.mp4$/i, '.jpg') : null }
  if (propio && /\.html?$/i.test(abs.pathname)) return { tipo: 'iframe', src: abs.href, link: abs.href, poster: abs.pathname.replace(/\.html?$/i, '.jpg') }
  return { tipo: 'enlace', src: abs.href, link: abs.href, poster: null }
}

function TablaItems({ items, moneda, hayMensual }: { items: CotizacionItem[]; moneda: Moneda; hayMensual: boolean }) {
  return (
    <table className="mt-3 w-full border-collapse text-[15px]">
      <thead>
        <tr className="border-b-2 border-tinta text-left text-xs font-semibold tracking-wide text-tinta-suave uppercase">
          <th className="py-2 pr-3">Detalle</th>
          <th className="w-14 py-2 text-right">Cant.</th>
          <th className="w-32 py-2 text-right">Implementación</th>
          {hayMensual && <th className="w-28 py-2 pl-3 text-right">Mensual</th>}
        </tr>
      </thead>
      <tbody>
        {items.map((it) => (
          <tr key={it.id} className="border-b border-linea align-top">
            <td className="py-3 pr-3">{it.descripcion}</td>
            <td className="tabular py-3 text-right">{Number(it.cantidad)}</td>
            <td className="tabular py-3 text-right">
              {Number(it.precio_implementacion) ? formatMonto(Number(it.cantidad) * Number(it.precio_implementacion), moneda) : '—'}
            </td>
            {hayMensual && (
              <td className="tabular py-3 pl-3 text-right">
                {Number(it.precio_mensual) ? formatMonto(Number(it.cantidad) * Number(it.precio_mensual), moneda) : '—'}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * Cotización / propuesta lista para imprimir o guardar como PDF (fondo blanco).
 * Con introducción, video o etapas es una propuesta: 1ª hoja presentación y etapas, 2ª hoja el video, después el detalle
 * por etapa con precios. Sin eso, la cotización de una hoja de siempre.
 */
export function CotizacionImprimiblePage() {
  const { id } = useParams()
  const { cotizacion: c, cargando, error } = useCotizacionCompleta(id)

  if (cargando) return <PantallaCarga />
  if (!c) return <p className="p-10 text-center text-tenue">{error ?? 'No se encontró la cotización.'}</p>

  const t = totalesCotizacion(c)
  const items = [...c.cotizacion_items].sort((a, b) => a.orden - b.orden)
  const hayMensual = t.mensual > 0
  const cliente = c.prospectos
  const etapas = c.etapas ?? []
  const video = c.video_url ? videoDe(c.video_url) : null
  const esPropuesta = !!(c.introduccion || video || etapas.length)

  // Ítems por etapa; los que no tienen etapa (o una que ya no existe) van al final
  const porEtapa = etapas.map((_, n) => items.filter((it) => it.etapa === n + 1))
  const sueltos = etapas.length ? items.filter((it) => !it.etapa || it.etapa > etapas.length) : items
  const sumar = (lista: CotizacionItem[], campo: 'precio_implementacion' | 'precio_mensual') =>
    lista.reduce((s, it) => s + Number(it.cantidad) * Number(it[campo]), 0)

  return (
    <div className="min-h-full bg-elevada py-8 print:bg-papel print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[800px] justify-end gap-2 px-4">
        <Button onClick={() => window.print()}>
          <Printer className="size-[18px]" /> Imprimir / guardar PDF
        </Button>
      </div>

      <article className="mx-auto max-w-[800px] bg-papel px-8 py-10 text-tinta shadow-2xl sm:px-12 print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b border-linea pb-6">
          <div className="flex items-center gap-3">
            <LogoMark sobreClaro className="h-9 w-auto" />
            <div>
              <div className="text-2xl leading-none font-bold tracking-tight">brixx</div>
              <div className="mt-1 text-sm text-tinta-suave">Soluciones digitales</div>
            </div>
          </div>
          <div className="text-right">
            <div className="font-display text-xl font-bold">{esPropuesta ? 'Propuesta' : 'Cotización'}</div>
            <div className="tabular text-sm text-tinta-suave">{numeroCotizacion(c.numero)}</div>
            <div className="text-sm text-tinta-suave">{formatFechaLarga(c.fecha)}</div>
          </div>
        </header>

        <section className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <div className="text-xs font-semibold tracking-wide text-tinta-suave uppercase">Para</div>
            <div className="mt-1 text-lg font-semibold">{cliente?.empresa || cliente?.nombre || '—'}</div>
            {cliente?.empresa && <div className="text-sm">{cliente.nombre}</div>}
            {cliente?.email && <div className="text-sm text-tinta-suave">{cliente.email}</div>}
          </div>
          {c.valida_hasta && (
            <div className="sm:text-right">
              <div className="text-xs font-semibold tracking-wide text-tinta-suave uppercase">Válida hasta</div>
              <div className="mt-1">{formatFechaLarga(c.valida_hasta)}</div>
            </div>
          )}
        </section>

        {c.titulo && <h1 className="mt-8 font-display text-[26px] leading-tight font-bold">{c.titulo}</h1>}

        {/* Hoja 1: presentación y las etapas de un vistazo */}
        {c.introduccion && <p className="mt-4 text-[16px] leading-relaxed whitespace-pre-line">{c.introduccion}</p>}
        {etapas.length > 0 && (
          <section className="mt-8">
            <div className="text-xs font-semibold tracking-wide text-tinta-suave uppercase">Cómo lo hacemos</div>
            <ol className="mt-3 flex flex-col gap-3">
              {etapas.map((e, n) => (
                <li key={n} className="flex gap-4 rounded-xl border border-linea p-4 break-inside-avoid">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-tinta font-bold text-papel">{n + 1}</span>
                  <div>
                    <div className="text-xs font-semibold tracking-wide text-tinta-suave uppercase">Etapa {n + 1}</div>
                    <div className="font-display text-lg leading-snug font-bold">{e.titulo}</div>
                    {e.detalle && <p className="mt-1 text-[14px] leading-relaxed text-tinta-media">{e.detalle}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* Hoja 2: el video */}
        {video && (
          <section className="mt-12 print:mt-0 print:break-before-page">
            <div className="text-xs font-semibold tracking-wide text-tinta-suave uppercase">Mirá cómo funcionaría</div>
            <h2 className="mt-1 font-display text-[24px] leading-tight font-bold">Así trabajaría con {cliente?.empresa || cliente?.nombre || 'vos'}</h2>
            {/* En pantalla se reproduce acá mismo */}
            <div className="no-print mt-4 overflow-hidden rounded-xl bg-tinta">
              {video.tipo === 'video' ? (
                <video src={video.src} poster={video.poster ?? undefined} controls playsInline preload="metadata" className="aspect-video w-full" />
              ) : video.tipo === 'iframe' ? (
                <iframe src={video.src} title="Video de la propuesta" allow="fullscreen; autoplay" className="aspect-video w-full border-0" />
              ) : (
                <a href={video.link} target="_blank" rel="noreferrer" className="flex aspect-video items-center justify-center gap-2 text-lg font-semibold text-papel">
                  <Play className="size-6" /> Ver el video
                </a>
              )}
            </div>
            {/* En el PDF: la imagen con el link (se toca y abre el video) */}
            <a href={video.link} target="_blank" rel="noreferrer" className="mt-4 hidden overflow-hidden rounded-xl border border-linea print:block">
              <div className="relative aspect-video bg-tinta">
                {video.poster && <img src={video.poster} alt="" className="absolute inset-0 size-full object-cover" />}
                <span className="absolute inset-0 grid place-items-center">
                  <span className="grid size-20 place-items-center rounded-full bg-papel text-tinta">
                    <Play className="ml-1 size-9 fill-current" />
                  </span>
                </span>
              </div>
              <div className="px-4 py-3 text-[14px]">
                <b>Tocá para ver el video</b>
                <span className="ml-2 break-all text-tinta-suave">{video.link.replace(/^https?:\/\//, '')}</span>
              </div>
            </a>
          </section>
        )}

        {/* El detalle con precios (en una propuesta, en otra hoja y por etapa) */}
        <section className={esPropuesta ? 'mt-12 print:mt-0 print:break-before-page' : ''}>
          {esPropuesta && <div className="text-xs font-semibold tracking-wide text-tinta-suave uppercase">Inversión</div>}
          {etapas.map((e, n) =>
            porEtapa[n].length ? (
              <div key={n} className="mt-6 break-inside-avoid">
                <div className="text-xs font-semibold tracking-wide text-tinta-suave uppercase">Etapa {n + 1}</div>
                <h3 className="font-display text-lg font-bold">{e.titulo}</h3>
                <TablaItems items={porEtapa[n]} moneda={c.moneda} hayMensual={hayMensual} />
                <div className="mt-2 flex justify-end gap-6 text-[14px] text-tinta-suave">
                  <span>
                    Etapa {n + 1}: <b className="tabular text-tinta">{formatMonto(sumar(porEtapa[n], 'precio_implementacion'), c.moneda)}</b>
                  </span>
                  {sumar(porEtapa[n], 'precio_mensual') > 0 && (
                    <span>
                      + <b className="tabular text-tinta">{formatMonto(sumar(porEtapa[n], 'precio_mensual'), c.moneda)}/mes</b>
                    </span>
                  )}
                </div>
              </div>
            ) : null,
          )}
          {sueltos.length > 0 && (
            <div className={etapas.length ? 'mt-6' : 'mt-6'}>
              {etapas.length > 0 && <h3 className="font-display text-lg font-bold">Además</h3>}
              <TablaItems items={sueltos} moneda={c.moneda} hayMensual={hayMensual} />
            </div>
          )}

          <div className="mt-6 ml-auto max-w-sm break-inside-avoid">
            {t.descuento > 0 && (
              <>
                <div className="flex justify-between py-1 text-tinta-suave">
                  <span>Subtotal</span>
                  <span className="tabular">{formatMonto(t.subtotal, c.moneda)}</span>
                </div>
                <div className="flex justify-between py-1 text-tinta-suave">
                  <span>Descuento ({Number(c.descuento_pct)}%)</span>
                  <span className="tabular">− {formatMonto(t.descuento, c.moneda)}</span>
                </div>
              </>
            )}
            <div className="mt-1 flex items-baseline justify-between border-t-2 border-tinta pt-3">
              <span className="font-semibold">{etapas.length ? 'Total de las etapas' : 'Total implementación'}</span>
              <span className="tabular font-display text-2xl font-bold">{formatMonto(t.implementacion, c.moneda)}</span>
            </div>
            {hayMensual && (
              <div className="mt-1 flex items-baseline justify-between">
                <span className="font-semibold">Abono mensual</span>
                <span className="tabular font-display text-lg font-bold">{formatMonto(t.mensual, c.moneda)}/mes</span>
              </div>
            )}
            {c.moneda === 'USD' && <p className="mt-2 text-right text-xs text-tinta-suave">Valores en dólares estadounidenses.</p>}
          </div>
        </section>

        {c.notas && (
          <section className="mt-10 break-inside-avoid">
            <div className="text-xs font-semibold tracking-wide text-tinta-suave uppercase">Condiciones</div>
            <p className="mt-2 text-[15px] whitespace-pre-line">{c.notas}</p>
          </section>
        )}

        <footer className="mt-12 border-t border-linea pt-4 text-center text-sm text-tinta-suave">
          brixx · Soluciones digitales
        </footer>
      </article>
    </div>
  )
}
