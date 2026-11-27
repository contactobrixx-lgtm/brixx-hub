// Agente "financiero": una vez por mes (y a pedido) mira la plata del estudio: cobrado y costos de los
// últimos 6 meses, margen, cuánto se va en IA, ingreso recurrente, por cobrar, de qué clientes depende el
// ingreso y la proyección del mes. Los números se calculan acá; Claude solo los interpreta.
import { ahoraAR, empezarInforme, marcarCorrida, nombreCliente, pensarJSON, terminarInforme, totales, type Contexto, type Fila } from './comun.ts'

const ACTIVOS = ['implementacion', 'mantenimiento']
// Cliente ganado = aceptó la propuesta (demo) en adelante
const GANADAS = ['demo', 'implementacion', 'mantenimiento']

/** "AAAA-MM" de los últimos n meses (el actual al final) */
function meses(n: number, hoy: string): string[] {
  const [a, m] = hoy.split('-').map(Number)
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(a, m - 1 - (n - 1 - i), 1))
    return d.toISOString().slice(0, 7)
  })
}

/** Lo que cuesta un costo en un mes (misma regla que el hub: mensual, anual = 1/12, único solo en su mes) */
function costoDelMes(c: Fila, mes: string): number {
  const desde = String(c.desde).slice(0, 7)
  const hasta = c.hasta ? String(c.hasta).slice(0, 7) : null
  if (mes < desde || (hasta && mes > hasta)) return 0
  if (c.frecuencia === 'mensual') return Number(c.monto)
  if (c.frecuencia === 'anual') return Number(c.monto) / 12
  return mes === desde ? Number(c.monto) : 0
}

const usd = (n: number) => `US$ ${Math.round(n).toLocaleString('es-AR')}`

/** Arma la foto financiera en texto (para Claude y para el informe). */
async function numeros(ctx: Contexto): Promise<{ texto: string; claves: Fila }> {
  const { fecha } = ahoraAR()
  const ult = meses(6, fecha)
  const [prospectos, tc, { data: cobros }, { data: costos }, { data: aceptadas }] = await Promise.all([
    ctx.hub.prospectos(),
    ctx.hub.tipoCambio(),
    ctx.db.from('cobros').select('fecha, monto, moneda, concepto, prospecto_id').gte('fecha', `${ult[0]}-01`),
    ctx.db.from('costos').select('nombre, categoria, monto, moneda, frecuencia, desde, hasta'),
    ctx.db.from('cotizaciones').select('prospecto_id, moneda, descuento_pct, cotizacion_items(cantidad, precio_implementacion, precio_mensual, opcional)').eq('estado', 'aceptada'),
  ])
  const aUSD = (m: number, moneda: unknown) => (moneda === 'USD' ? Number(m) : tc ? Number(m) / tc : 0)
  const sinTC = !tc && [...(cobros ?? []), ...(costos ?? [])].some((x) => x.moneda === 'ARS')
  const porId = new Map(prospectos.map((p) => [p.id as string, p]))

  const filas = ult.map((mes) => {
    const enMes = (cobros ?? []).filter((c) => String(c.fecha).startsWith(mes))
    const cobrado = enMes.reduce((t, c) => t + aUSD(c.monto as number, c.moneda), 0)
    const abonos = enMes.filter((c) => c.concepto === 'abono').reduce((t, c) => t + aUSD(c.monto as number, c.moneda), 0)
    const costo = (costos ?? []).reduce((t, c) => t + aUSD(costoDelMes(c, mes), c.moneda), 0)
    const ia = (costos ?? []).filter((c) => c.categoria === 'ia').reduce((t, c) => t + aUSD(costoDelMes(c, mes), c.moneda), 0)
    const adq = (costos ?? []).filter((c) => c.categoria === 'adquisicion').reduce((t, c) => t + aUSD(costoDelMes(c, mes), c.moneda), 0)
    return { mes, cobrado, abonos, costo, ia, adq, margen: cobrado - costo }
  })

  // Ingreso de los últimos 6 meses por cliente (concentración)
  const porCliente = new Map<string, number>()
  for (const c of cobros ?? []) if (c.prospecto_id) porCliente.set(c.prospecto_id as string, (porCliente.get(c.prospecto_id as string) ?? 0) + aUSD(c.monto as number, c.moneda))
  const total6 = filas.reduce((t, f) => t + f.cobrado, 0)
  const ranking = [...porCliente.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)

  // Recurrente y por cobrar
  const activos = new Set(prospectos.filter((p) => ACTIVOS.includes(p.etapa as string)).map((p) => p.id))
  const mrr = (aceptadas ?? []).filter((c) => activos.has(c.prospecto_id)).reduce((t, c) => t + aUSD(totales(c).mes, c.moneda), 0)
  const { data: todosCobros } = await ctx.db.from('cobros').select('prospecto_id, monto, moneda, concepto')
  const cobradoImpl = new Map<unknown, number>()
  for (const c of todosCobros ?? []) if (c.concepto !== 'abono') cobradoImpl.set(c.prospecto_id, (cobradoImpl.get(c.prospecto_id) ?? 0) + aUSD(c.monto as number, c.moneda))
  const implPorCliente = new Map<unknown, number>()
  for (const c of aceptadas ?? []) if (GANADAS.includes(String(porId.get(c.prospecto_id as string)?.etapa))) implPorCliente.set(c.prospecto_id, (implPorCliente.get(c.prospecto_id) ?? 0) + aUSD(totales(c).impl, c.moneda))
  let porCobrar = 0
  for (const [id, impl] of implPorCliente) porCobrar += Math.max(0, impl - (cobradoImpl.get(id) ?? 0))

  // Proyección simple del mes: lo cobrado + abonos que faltan de clientes en mantenimiento
  const esteMes = filas[filas.length - 1]
  const mantenimiento = prospectos.filter((p) => p.etapa === 'mantenimiento')
  const abonosFaltan = mantenimiento.reduce((t, p) => {
    const pago = (cobros ?? []).some((c) => c.prospecto_id === p.id && c.concepto === 'abono' && String(c.fecha).startsWith(esteMes.mes))
    if (pago) return t
    return t + (aceptadas ?? []).filter((c) => c.prospecto_id === p.id).reduce((s, c) => s + aUSD(totales(c).mes, c.moneda), 0)
  }, 0)
  const costosFijos = (costos ?? []).filter((c) => c.frecuencia !== 'unico').reduce((t, c) => t + aUSD(costoDelMes(c, esteMes.mes), c.moneda), 0)

  const texto = [
    `Fecha: ${fecha}. Todo en USD${tc ? ` (tipo de cambio ${tc} ARS por USD)` : ''}.${sinTC ? ' ATENCIÓN: no hay tipo de cambio cargado, lo que está en pesos no se suma.' : ''}`,
    'POR MES (cobrado · de eso abonos · costos · de eso IA · de eso adquisición · margen):',
    ...filas.map((f) => `- ${f.mes}: ${usd(f.cobrado)} · ${usd(f.abonos)} · ${usd(f.costo)} · ${usd(f.ia)} · ${usd(f.adq)} · ${usd(f.margen)}`),
    `Ingreso recurrente (abonos de clientes activos): ${usd(mrr)} por mes. Costos fijos del mes: ${usd(costosFijos)} (el recurrente cubre el ${costosFijos ? Math.round((mrr / costosFijos) * 100) : 0}%).`,
    `Por cobrar (implementación aceptada no cobrada): ${usd(porCobrar)}.`,
    `Este mes: cobrado hasta hoy ${usd(esteMes.cobrado)}; faltan abonos por ${usd(abonosFaltan)}; proyección ${usd(esteMes.cobrado + abonosFaltan)} contra costos ${usd(esteMes.costo)}.`,
    `Ingreso de los últimos 6 meses por cliente (total ${usd(total6)}): ${ranking.map(([id, v]) => `${nombreCliente(porId.get(id))} ${usd(v)} (${total6 ? Math.round((v / total6) * 100) : 0}%)`).join('; ') || 'sin cobros'}.`,
    `Costos vigentes: ${(costos ?? []).filter((c) => costoDelMes(c, esteMes.mes) > 0).map((c) => `${c.nombre} (${c.categoria}, ${c.frecuencia}) ${usd(aUSD(costoDelMes(c, esteMes.mes), c.moneda))}/mes`).join('; ') || 'ninguno'}.`,
  ].join('\n')
  return { texto, claves: { mrr, porCobrar, proyeccion: esteMes.cobrado + abonosFaltan, costo: esteMes.costo } }
}

const ESQUEMA = {
  type: 'object',
  properties: { resumen: { type: 'string' }, analisis: { type: 'string' } },
  required: ['resumen', 'analisis'],
  additionalProperties: false,
}

export async function correrFinanciero(ctx: Contexto, manual: boolean): Promise<string | null> {
  const { fecha } = ahoraAR()
  const id = await empezarInforme(ctx, 'financiero', manual ? null : `financiero:${fecha.slice(0, 7)}`, { titulo: 'Análisis financiero: calculando…' })
  if (!id) return null
  try {
    const { texto, claves } = await numeros(ctx)
    const r = await pensarJSON<{ resumen: string; analisis: string }>(ctx, {
      esquema: ESQUEMA,
      sistema: `Sos el analista financiero de brixx (como un CFO de bolsillo para dos socios). Te paso los números ya calculados: no los recalcules ni inventes otros.
analisis (texto plano, máximo 35 líneas) con estas secciones:
CÓMO VENIMOS (tendencia de cobrado y margen de los últimos meses, en 2 o 3 líneas)
DE QUIÉN DEPENDEMOS (concentración de ingresos: si un cliente pesa más del 40%, decilo)
COSTOS (dónde se va la plata, cuánto en IA y si conviene revisar algo)
RECURRENTE (cuánto cubre de los costos fijos y qué falta para cubrirlos)
ESTE MES (proyección y qué cobrar)
ALERTAS (solo si hay: margen negativo, falta tipo de cambio, mucho por cobrar)
RECOMENDACIONES (3 concretas, con números)
resumen: 1 o 2 oraciones para decir en voz alta.`,
      pedido: `<numeros>\n${texto}\n</numeros>`,
    })
    await terminarInforme(ctx, id, {
      titulo: `Análisis financiero · ${new Date(`${fecha}T12:00:00-03:00`).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}`,
      resumen: r.resumen,
      contenido: `${r.analisis}\n\nNÚMEROS USADOS\n${texto}`,
      datos: { claves },
    })
    await marcarCorrida(ctx, 'financiero', r.resumen)
    return r.resumen
  } catch (e) {
    await ctx.db.from('agentes_informes').update({ estado: 'error', titulo: 'Análisis financiero', error: e instanceof Error ? e.message : String(e) }).eq('id', id)
    await marcarCorrida(ctx, 'financiero', 'Con error.')
    throw e
  }
}
