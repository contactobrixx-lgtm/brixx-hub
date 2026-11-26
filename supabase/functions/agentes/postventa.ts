// Agente "postventa": una vez por semana mira a cada cliente activo (qué contrató, si paga el abono,
// hace cuánto no hablamos, qué dice su carpeta) y marca riesgos y oportunidades de venderle algo más,
// con un mensaje sugerido. No manda nada ni cambia datos.
import { ahoraAR, empezarInforme, marcarCorrida, nombreCliente, pensarJSON, terminarInforme, totales, type Contexto, type Fila } from './comun.ts'

const GANADAS = ['cerrado', 'implementacion', 'mantenimiento']

const ESQUEMA = {
  type: 'object',
  properties: {
    resumen: { type: 'string' },
    clientes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          prospecto_id: { type: 'string' },
          salud: { type: 'string', enum: ['bien', 'atencion', 'riesgo'] },
          motivo: { type: 'string' },
          oportunidad: { type: 'string' },
          mensaje: { type: 'string' },
        },
        required: ['prospecto_id', 'salud', 'motivo', 'oportunidad', 'mensaje'],
        additionalProperties: false,
      },
    },
  },
  required: ['resumen', 'clientes'],
  additionalProperties: false,
}

const dias = (iso: string | null | undefined) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 864e5) : null)

export async function correrPostventa(ctx: Contexto, manual: boolean): Promise<string | null> {
  const { fecha } = ahoraAR()
  const clientes = (await ctx.hub.prospectos()).filter((p) => GANADAS.includes(p.etapa as string))
  if (!clientes.length) {
    await marcarCorrida(ctx, 'postventa', 'Sin clientes activos.')
    return null
  }
  const id = await empezarInforme(ctx, 'postventa', manual ? null : `postventa:${fecha}`, { titulo: 'Postventa: revisando clientes…' })
  if (!id) return null

  const ids = clientes.map((p) => p.id as string)
  const [{ data: cots }, { data: cobros }, { data: grabs }, { data: reus }, { data: servicios }] = await Promise.all([
    ctx.db.from('cotizaciones').select('prospecto_id, moneda, descuento_pct, cotizacion_items(descripcion, cantidad, precio_implementacion, precio_mensual, opcional)').eq('estado', 'aceptada').in('prospecto_id', ids),
    ctx.db.from('cobros').select('prospecto_id, concepto, fecha').in('prospecto_id', ids).order('fecha', { ascending: false }),
    ctx.db.from('grabaciones').select('prospecto_id, created_at').in('prospecto_id', ids).order('created_at', { ascending: false }),
    ctx.db.from('reuniones').select('prospecto_id, inicio').in('prospecto_id', ids).lte('inicio', new Date().toISOString()).order('inicio', { ascending: false }),
    ctx.db.from('servicios').select('nombre, descripcion, precio_implementacion, precio_mensual').eq('activo', true),
  ])

  const ficha = (p: Fila) => {
    const suyas = (cots ?? []).filter((c) => c.prospecto_id === p.id)
    const contratado = suyas.flatMap((c) => ((c.cotizacion_items as Fila[]) ?? []).map((i) => String(i.descripcion))).join('; ') || 'sin cotización aceptada'
    const abono = suyas.reduce((t, c) => t + totales(c).mes, 0)
    const ultimoAbono = (cobros ?? []).find((c) => c.prospecto_id === p.id && c.concepto === 'abono')?.fecha as string | undefined
    const ultimaCharla = [(grabs ?? []).find((g) => g.prospecto_id === p.id)?.created_at, (reus ?? []).find((r) => r.prospecto_id === p.id)?.inicio]
      .filter(Boolean)
      .sort()
      .pop() as string | undefined
    const s = (p.sintesis as Fila | null) ?? null
    return [
      `- prospecto_id ${p.id} · ${nombreCliente(p)} (${p.etapa}${p.fecha_cierre ? `, cliente desde ${p.fecha_cierre}` : ''}; rubro ${p.rubro || p.industria || '—'})`,
      `  contratado: ${contratado}${abono ? `; abono ${Math.round(abono)} ${suyas[0]?.moneda ?? ''}/mes; último abono cobrado: ${ultimoAbono ?? 'nunca'}` : ''}`,
      `  última reunión o conversación: ${ultimaCharla ? `hace ${dias(ultimaCharla)} días` : 'no hay registro'}; próxima acción: ${p.proxima_accion || '—'}`,
      s ? `  carpeta: ${String(s.situacion ?? '').slice(0, 400)} | hacé ahora: ${JSON.stringify(s.hacer_ahora ?? '').slice(0, 300)}` : '',
      p.notas ? `  notas: ${String(p.notas).slice(-400)}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  }

  try {
    const r = await pensarJSON<{ resumen: string; clientes: { prospecto_id: string; salud: string; motivo: string; oportunidad: string; mensaje: string }[] }>(ctx, {
      esquema: ESQUEMA,
      sistema: `Sos el agente de postventa de brixx. Revisá cada cliente activo y decidí:
- salud: "bien", "atencion" o "riesgo" (riesgo: no paga, hace mucho no hablamos, está trabado o disconforme).
- motivo: por qué, en una oración con datos.
- oportunidad: qué otro servicio del catálogo le serviría y por qué (o "ninguna por ahora").
- mensaje: un WhatsApp corto y cálido para retomar contacto o proponer la oportunidad (no para cobrar), voseo, firmado "brixx".
resumen: 1 o 2 oraciones para los socios con lo más importante (quién está en riesgo y la mejor oportunidad). Ordená los clientes de más urgente a menos.`,
      pedido: `<fecha>${fecha}</fecha>\n<catalogo>\n${(servicios ?? []).map((s) => `- ${s.nombre}: ${s.descripcion ?? ''} (US$ ${s.precio_implementacion} + ${s.precio_mensual}/mes)`).join('\n')}\n</catalogo>\n<clientes>\n${clientes.map(ficha).join('\n')}\n</clientes>`,
    })
    const enRiesgo = r.clientes.filter((c) => c.salud === 'riesgo').length
    const conOportunidad = r.clientes.filter((c) => !/^ninguna/i.test(c.oportunidad)).length
    const porId = new Map(clientes.map((p) => [String(p.id), p]))
    const etiqueta = { bien: 'BIEN', atencion: 'ATENCIÓN', riesgo: 'RIESGO' } as Record<string, string>
    await terminarInforme(ctx, id, {
      titulo: `Postventa: ${enRiesgo ? `${enRiesgo} en riesgo · ` : ''}${conOportunidad} ${conOportunidad === 1 ? 'oportunidad' : 'oportunidades'}`,
      resumen: r.resumen,
      contenido: r.clientes
        .map((c) => `${etiqueta[c.salud] ?? c.salud} · ${nombreCliente(porId.get(c.prospecto_id))}\n- ${c.motivo}\n- Oportunidad: ${c.oportunidad}`)
        .join('\n\n'),
      datos: {
        clientes: r.clientes.map((c) => ({ ...c, cliente: nombreCliente(porId.get(c.prospecto_id)), telefono: porId.get(c.prospecto_id)?.telefono ?? null })),
      },
    })
    await marcarCorrida(ctx, 'postventa', r.resumen)
    return r.resumen
  } catch (e) {
    await ctx.db.from('agentes_informes').update({ estado: 'error', titulo: 'Postventa', error: e instanceof Error ? e.message : String(e) }).eq('id', id)
    await marcarCorrida(ctx, 'postventa', 'Con error.')
    throw e
  }
}
