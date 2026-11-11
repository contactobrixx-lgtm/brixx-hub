import { useEffect, useRef, useState } from 'react'
import { MESES_CORTOS, formatUSD } from '../../lib/format'

export interface PuntoMensual {
  mes: string // YYYY-MM
  cobrado: number
  costo: number
}

const ALTO = 220
const IZQ = 56
const DER = 8
const ARRIBA = 12
const ABAJO = 26
const BARRA = 22
const GAP = 2

function escalaLinda(max: number) {
  if (max <= 0) return { tope: 100, paso: 25 }
  const crudo = max / 4
  const mag = 10 ** Math.floor(Math.log10(crudo))
  const paso = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((p) => p >= crudo) ?? crudo
  return { tope: Math.ceil(max / paso) * paso, paso }
}

const compacto = (v: number) => (v >= 10000 ? `${Math.round(v / 1000)}K` : new Intl.NumberFormat('es-AR').format(v))

function etiquetaMes(mes: string) {
  const [y, m] = mes.split('-').map(Number)
  return m === 1 ? `${MESES_CORTOS[0]} ${String(y).slice(2)}` : MESES_CORTOS[m - 1]
}

/** Columnas agrupadas: cobrado vs costos por mes (USD). Un solo eje. */
export function GraficoMensual({ datos }: { datos: PuntoMensual[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [ancho, setAncho] = useState(600)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setAncho(Math.max(280, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const max = Math.max(0, ...datos.flatMap((d) => [d.cobrado, d.costo]))
  if (max === 0) {
    return <p className="py-10 text-center text-tenue">Aparece cuando haya cobros o costos cargados.</p>
  }

  const { tope, paso } = escalaLinda(max)
  const pw = ancho - IZQ - DER
  const ph = ALTO - ARRIBA - ABAJO
  const banda = pw / datos.length
  const y = (v: number) => ARRIBA + ph - (v / tope) * ph
  const ticks = Array.from({ length: Math.round(tope / paso) + 1 }, (_, i) => i * paso)

  // Columna con extremo superior redondeado (4px) y base recta.
  const columna = (x: number, v: number) => {
    const h = Math.max(0, (v / tope) * ph)
    if (h < 1) return ''
    const r = Math.min(4, h, BARRA / 2)
    const top = ARRIBA + ph - h
    const base = ARRIBA + ph
    return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + BARRA - r}Q${x + BARRA},${top} ${x + BARRA},${top + r}V${base}Z`
  }

  const d = hover != null ? datos[hover] : null
  const cx = hover != null ? IZQ + banda * hover + banda / 2 : 0

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4 text-[13px] text-suave">
        <span className="flex items-center gap-1.5">
          <i className="size-2.5 rounded-sm bg-serie-ingreso" /> Cobrado
        </span>
        <span className="flex items-center gap-1.5">
          <i className="size-2.5 rounded-sm bg-serie-costo" /> Costos
        </span>
      </div>
      <div ref={ref} className="relative">
        <svg width={ancho} height={ALTO} role="img" aria-label="Cobrado y costos por mes, en dólares" className="block">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={IZQ} x2={ancho - DER} y1={y(t)} y2={y(t)} className="stroke-borde" strokeWidth={1} />
              <text x={IZQ - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-tenue text-[11px] tabular">
                {compacto(t)}
              </text>
            </g>
          ))}
          {datos.map((p, i) => {
            const centro = IZQ + banda * i + banda / 2
            const x1 = centro - BARRA - GAP / 2
            const x2 = centro + GAP / 2
            return (
              <g key={p.mes}>
                <path d={columna(x1, p.cobrado)} className="fill-serie-ingreso" />
                <path d={columna(x2, p.costo)} className="fill-serie-costo" />
                <text x={centro} y={ALTO - 8} textAnchor="middle" className="fill-tenue text-[11px]">
                  {etiquetaMes(p.mes)}
                </text>
                <rect
                  x={IZQ + banda * i}
                  y={ARRIBA}
                  width={banda}
                  height={ph}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => setHover(hover === i ? null : i)}
                />
              </g>
            )
          })}
        </svg>
        {d && (
          <div
            className="pointer-events-none absolute top-0 z-10 w-48 rounded-xl border border-borde-fuerte bg-fondo px-3 py-2.5 text-[13px] shadow-xl"
            style={{ left: Math.min(Math.max(cx - 96, 0), ancho - 192) }}
          >
            <div className="mb-1.5 font-semibold">{etiquetaMes(d.mes)}</div>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-suave">
                <i className="size-2 rounded-sm bg-serie-ingreso" /> Cobrado
              </span>
              <span className="tabular font-semibold">{formatUSD(d.cobrado)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-suave">
                <i className="size-2 rounded-sm bg-serie-costo" /> Costos
              </span>
              <span className="tabular font-semibold">{formatUSD(d.costo)}</span>
            </div>
            <div className="mt-1 flex justify-between gap-2 border-t border-borde pt-1">
              <span className="text-suave">Margen</span>
              <span className="tabular font-semibold">{formatUSD(d.cobrado - d.costo)}</span>
            </div>
          </div>
        )}
      </div>
      <details className="mt-2 text-[13px]">
        <summary className="cursor-pointer text-tenue hover:text-suave">Ver como tabla</summary>
        <table className="mt-2 w-full">
          <thead>
            <tr className="text-left text-tenue">
              <th className="py-1 font-medium">Mes</th>
              <th className="py-1 text-right font-medium">Cobrado</th>
              <th className="py-1 text-right font-medium">Costos</th>
              <th className="py-1 text-right font-medium">Margen</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {datos.map((p) => (
              <tr key={p.mes} className="border-t border-borde">
                <td className="py-1">{etiquetaMes(p.mes)}</td>
                <td className="py-1 text-right">{formatUSD(p.cobrado)}</td>
                <td className="py-1 text-right">{formatUSD(p.costo)}</td>
                <td className="py-1 text-right">{formatUSD(p.cobrado - p.costo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
