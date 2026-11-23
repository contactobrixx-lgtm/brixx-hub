// Agente "ventas" (aprendizaje de ventas): una vez por mes (y a pedido) compara lo que se ganó contra lo
// que se perdió: por servicio, por rubro, por precio y por tiempo, los motivos de pérdida y las objeciones
// que se repiten en reuniones e intervenciones. Los números se calculan acá; Claude saca las conclusiones.
import { ahoraAR, empezarInforme, marcarCorrida, nombreCliente, pensarJSON, terminarInforme, totales, type Contexto, type Fila } from './comun.ts'

const GANADAS = ['cerrado', 'implementacion', 'mantenimiento']

const usd = (n: number) => `US$ ${Math.round(n).toLocaleString('es-AR')}`
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—')
const dias = (a: string, b: string) => Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 864e5))

async function datosDeVentas(ctx: Contexto): Promise<{ texto: string; decididas: number }> {
  const [prospectos, tc, { data: cots }, { data: grabs }] = await Promise.all([
    ctx.hub.prospectos(),
    ctx.hub.tipoCambio(),
    ctx.db.from('cotizaciones').select('id, prospecto_id, estado, fecha, moneda, descuento_pct, cotizacion_items(descripcion, cantidad, precio_implementacion, precio_mensual, opcional)'),
    ctx.db.from('grabaciones').select('prospecto_id, analisis, created_at').eq('estado', 'lista').order('created_at', { ascending: false }).limit(60),
  ])
  const aUSD = (m: number, moneda: unknown) => (moneda === 'USD' ? m : tc ? m / tc : 0)
  const porId = new Map(prospectos.map((p) => [p.id as string, p]))
  const decididas = (cots ?? []).filter((c) => c.estado === 'aceptada' || c.estado === 'rechazada')
  const enviadas = (cots ?? []).filter((c) => c.estado === 'enviada')

  // Por servicio (nombre antes del " — ")
  const servicio = new Map<string, { ganadas: number; perdidas: number; abiertas: number }>()
  for (const c of [...decididas, ...enviadas]) {
    for (const it of (c.cotizacion_items as Fila[]) ?? []) {
      const nombre = String(it.descripcion).split(' — ')[0].trim()
      const s = servicio.get(nombre) ?? { ganadas: 0, perdidas: 0, abiertas: 0 }
      if (c.estado === 'aceptada') s.ganadas++
      else if (c.estado === 'rechazada') s.perdidas++
      else s.abiertas++
      servicio.set(nombre, s)
    }
  }
  // Por rubro
  const rubro = new Map<string, { ganados: number; perdidos: number; abiertos: number }>()
  for (const p of prospectos) {
    const r = String(p.rubro || p.industria || 'sin rubro')
    const x = rubro.get(r) ?? { ganados: 0, perdidos: 0, abiertos: 0 }
    if (GANADAS.includes(p.etapa as string)) x.ganados++
    else if (p.etapa === 'perdido') x.perdidos++
    else x.abiertos++
    rubro.set(r, x)
  }
  // Precio: ticket promedio ganado vs perdido
  const ticket = (lista: Fila[]) => (lista.length ? lista.reduce((t, c) => t + aUSD(totales(c).impl, c.moneda), 0) / lista.length : 0)
  const ganadas = decididas.filter((c) => c.estado === 'aceptada')
  const perdidas = decididas.filter((c) => c.estado === 'rechazada')
  const conDescuento = decididas.filter((c) => Number(c.descuento_pct) > 0)
  // Tiempo hasta cerrar
  const tiempos = prospectos.filter((p) => GANADAS.includes(p.etapa as string) && p.fecha_cierre && p.created_at).map((p) => dias(String(p.created_at), String(p.fecha_cierre)))
  // Motivos de pérdida
  const motivos = prospectos.filter((p) => p.etapa === 'perdido').map((p) => `${nombreCliente(p)}: ${p.motivo_perdida || 'sin motivo cargado'}`)
  // Objeciones y dolores de reuniones e intervenciones
  const objeciones: string[] = []
  for (const g of grabs ?? []) {
    const a = (g.analisis ?? {}) as Fila
    for (const pc of (a.puntos_clave as Fila[]) ?? []) if (pc.tipo === 'objecion' || pc.tipo === 'presupuesto') objeciones.push(`${nombreCliente(porId.get(g.prospecto_id as string))}: ${pc.titulo} — ${pc.detalle}`)
    for (const d of (a.cuellos_de_botella as string[]) ?? []) objeciones.push(`${nombreCliente(porId.get(g.prospecto_id as string))} (cuello de botella): ${d}`)
  }

  const texto = [
    `Cotizaciones: ${ganadas.length} aceptadas, ${perdidas.length} rechazadas, ${enviadas.length} esperando respuesta. Tasa de cierre de cotizaciones decididas: ${pct(ganadas.length, decididas.length)}.`,
    `Ticket promedio de implementación: aceptadas ${usd(ticket(ganadas))}, rechazadas ${usd(ticket(perdidas))}. Con descuento: ${conDescuento.length} de ${decididas.length} (aceptadas con descuento: ${conDescuento.filter((c) => c.estado === 'aceptada').length}).`,
    `Por servicio (ganadas / perdidas / esperando): ${[...servicio.entries()].map(([n, s]) => `${n} ${s.ganadas}/${s.perdidas}/${s.abiertas}`).join('; ') || 'sin datos'}.`,
    `Por rubro (ganados / perdidos / abiertos): ${[...rubro.entries()].map(([n, s]) => `${n} ${s.ganados}/${s.perdidos}/${s.abiertos}`).join('; ') || 'sin datos'}.`,
    `Días desde que entra hasta que cierra: ${tiempos.length ? `promedio ${Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length)}, mínimo ${Math.min(...tiempos)}, máximo ${Math.max(...tiempos)}` : 'sin datos'}.`,
    `Motivos de pérdida: ${motivos.join('; ') || 'ninguno cargado'}.`,
    `Objeciones, temas de presupuesto y cuellos de botella en reuniones e intervenciones (últimas 60): ${objeciones.slice(0, 40).join(' | ') || 'ninguna registrada'}.`,
  ].join('\n')
  return { texto, decididas: decididas.length + prospectos.filter((p) => p.etapa === 'perdido').length }
}

const ESQUEMA = {
  type: 'object',
  properties: { resumen: { type: 'string' }, analisis: { type: 'string' } },
  required: ['resumen', 'analisis'],
  additionalProperties: false,
}

export async function correrVentas(ctx: Contexto, manual: boolean): Promise<string | null> {
  const { fecha } = ahoraAR()
  const id = await empezarInforme(ctx, 'ventas', manual ? null : `ventas:${fecha.slice(0, 7)}`, { titulo: 'Aprendizaje de ventas: analizando…' })
  if (!id) return null
  try {
    const { texto, decididas } = await datosDeVentas(ctx)
    const r = await pensarJSON<{ resumen: string; analisis: string }>(ctx, {
      esquema: ESQUEMA,
      sistema: `Sos el analista comercial de brixx. Con los números ya calculados (no los recalcules ni inventes otros), sacá aprendizajes para vender más.
analisis (texto plano, máximo 35 líneas) con estas secciones:
QUÉ ESTÁ FUNCIONANDO (servicios, rubros y precios que cierran)
QUÉ NO (dónde perdemos y por qué)
OBJECIONES QUE SE REPITEN (y cómo responderlas la próxima vez)
PRECIOS Y DESCUENTOS (si el precio parece ser el problema o no)
DÓNDE BUSCAR CLIENTES (rubros a priorizar)
RECOMENDACIONES (3 a 5, concretas)
${decididas < 5 ? 'Hay pocos casos decididos todavía: decilo al principio y tratá las conclusiones como hipótesis.' : ''}
resumen: 1 o 2 oraciones para decir en voz alta.`,
      pedido: `<datos_de_ventas>\n${texto}\n</datos_de_ventas>`,
    })
    await terminarInforme(ctx, id, {
      titulo: `Aprendizaje de ventas · ${new Date(`${fecha}T12:00:00-03:00`).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}`,
      resumen: r.resumen,
      contenido: `${r.analisis}\n\nDATOS USADOS\n${texto}`,
    })
    await marcarCorrida(ctx, 'ventas', r.resumen)
    return r.resumen
  } catch (e) {
    await ctx.db.from('agentes_informes').update({ estado: 'error', titulo: 'Aprendizaje de ventas', error: e instanceof Error ? e.message : String(e) }).eq('id', id)
    await marcarCorrida(ctx, 'ventas', 'Con error.')
    throw e
  }
}
