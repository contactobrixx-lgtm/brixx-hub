import { useParams } from 'react-router-dom'
import { Printer } from 'lucide-react'
import { useCotizacionCompleta } from '../features/cotizador/useCotizador'
import { totalesCotizacion } from '../features/finanzas/calculos'
import { LogoMark } from '../components/layout/Logo'
import { Button } from '../components/ui/Button'
import { PantallaCarga } from '../components/ui/Spinner'
import { formatFechaLarga, formatMonto, numeroCotizacion } from '../lib/format'

/** Cotización lista para imprimir o guardar como PDF (fondo blanco). */
export function CotizacionImprimiblePage() {
  const { id } = useParams()
  const { cotizacion: c, cargando, error } = useCotizacionCompleta(id)

  if (cargando) return <PantallaCarga />
  if (!c) return <p className="p-10 text-center text-tenue">{error ?? 'No se encontró la cotización.'}</p>

  const t = totalesCotizacion(c)
  const items = [...c.cotizacion_items].sort((a, b) => a.orden - b.orden)
  const hayMensual = t.mensual > 0
  const cliente = c.prospectos

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
            <div className="font-display text-xl font-bold">Cotización</div>
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

        <table className="mt-6 w-full border-collapse text-[15px]">
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
                  {Number(it.precio_implementacion) ? formatMonto(Number(it.cantidad) * Number(it.precio_implementacion), c.moneda) : '—'}
                </td>
                {hayMensual && (
                  <td className="tabular py-3 pl-3 text-right">
                    {Number(it.precio_mensual) ? formatMonto(Number(it.cantidad) * Number(it.precio_mensual), c.moneda) : '—'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        <section className="mt-6 ml-auto max-w-sm break-inside-avoid">
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
            <span className="font-semibold">Total implementación</span>
            <span className="tabular font-display text-2xl font-bold">{formatMonto(t.implementacion, c.moneda)}</span>
          </div>
          {hayMensual && (
            <div className="mt-1 flex items-baseline justify-between">
              <span className="font-semibold">Abono mensual</span>
              <span className="tabular font-display text-lg font-bold">{formatMonto(t.mensual, c.moneda)}/mes</span>
            </div>
          )}
          {c.moneda === 'USD' && <p className="mt-2 text-right text-xs text-tinta-suave">Valores en dólares estadounidenses.</p>}
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
