// Agente "cobranzas": junta los abonos del mes sin cobrar y los saldos de implementación pendientes,
// y redacta un recordatorio amable para cada cliente. NO manda nada: el socio lo copia o lo abre en WhatsApp.
import { ahoraAR, empezarInforme, marcarCorrida, MODELO_RAPIDO, nombreCliente, pensarJSON, terminarInforme, totales, type Contexto, type Fila } from './comun.ts'

// Cliente ganado = aceptó la propuesta (demo) en adelante
const GANADAS = ['demo', 'implementacion', 'mantenimiento']
/** Días de gracia: el abono del mes se reclama a partir de este día */
const DIA_ABONO = 5

interface Pendiente {
  prospecto_id: string
  cliente: string
  contacto: string
  telefono: string | null
  tipo: 'abono' | 'saldo'
  monto: number
  moneda: string
  detalle: string
}

const ESQUEMA = {
  type: 'object',
  properties: {
    resumen: { type: 'string' },
    mensajes: {
      type: 'array',
      items: {
        type: 'object',
        properties: { prospecto_id: { type: 'string' }, tipo: { type: 'string', enum: ['abono', 'saldo'] }, texto: { type: 'string' } },
        required: ['prospecto_id', 'tipo', 'texto'],
        additionalProperties: false,
      },
    },
  },
  required: ['resumen', 'mensajes'],
  additionalProperties: false,
}

const monto = (n: number, moneda: string) => `${moneda === 'USD' ? 'US$' : '$'} ${Math.round(n).toLocaleString('es-AR')}`

async function pendientes(ctx: Contexto): Promise<Pendiente[]> {
  const { fecha } = ahoraAR()
  const mes = fecha.slice(0, 7)
  const dia = Number(fecha.slice(8, 10))
  const [prospectos, tc, { data: aceptadas }, { data: cobros }] = await Promise.all([
    ctx.hub.prospectos(),
    ctx.hub.tipoCambio(),
    ctx.db.from('cotizaciones').select('prospecto_id, moneda, descuento_pct, cotizacion_items(cantidad, precio_implementacion, precio_mensual, opcional)').eq('estado', 'aceptada'),
    ctx.db.from('cobros').select('prospecto_id, monto, moneda, concepto, fecha'),
  ])
  // Pasa un monto a la moneda de la cotización (con el tipo de cambio de ajustes)
  const enMoneda = (m: number, de: unknown, a: string) => (de === a ? Number(m) : !tc ? 0 : a === 'USD' ? Number(m) / tc : Number(m) * tc)
  const lista: Pendiente[] = []
  for (const p of prospectos.filter((x) => GANADAS.includes(x.etapa as string))) {
    const suyas = (aceptadas ?? []).filter((c) => c.prospecto_id === p.id)
    if (!suyas.length) continue
    const moneda = String(suyas[0].moneda ?? 'USD')
    const base = { prospecto_id: String(p.id), cliente: nombreCliente(p), contacto: String(p.nombre ?? ''), telefono: (p.telefono as string) || null, moneda }
    const suyosCobros = (cobros ?? []).filter((c) => c.prospecto_id === p.id)

    // Saldo de implementación
    const impl = suyas.reduce((t, c) => t + totales(c).impl, 0)
    const cobrado = suyosCobros.filter((c) => c.concepto !== 'abono').reduce((t, c) => t + enMoneda(c.monto as number, c.moneda, moneda), 0)
    const saldo = impl - cobrado
    if (saldo > 1) lista.push({ ...base, tipo: 'saldo', monto: saldo, detalle: `Saldo de implementación: ${monto(saldo, moneda)} de ${monto(impl, moneda)}` })

    // Abono del mes (solo clientes en mantenimiento, después de los días de gracia)
    const abono = suyas.reduce((t, c) => t + totales(c).mes, 0)
    if (p.etapa === 'mantenimiento' && abono > 0 && dia >= DIA_ABONO) {
      const pago = suyosCobros.some((c) => c.concepto === 'abono' && String(c.fecha).startsWith(mes))
      if (!pago) lista.push({ ...base, tipo: 'abono', monto: abono, detalle: `Abono de este mes sin cobrar: ${monto(abono, moneda)}` })
    }
  }
  return lista
}

export async function correrCobranzas(ctx: Contexto, manual: boolean): Promise<string | null> {
  const lista = await pendientes(ctx)
  if (!lista.length) {
    await marcarCorrida(ctx, 'cobranzas', 'Nada para reclamar.')
    return null
  }
  const { fecha } = ahoraAR()
  const clave = manual ? null : `cobranzas:${fecha}`
  const id = await empezarInforme(ctx, 'cobranzas', clave, { titulo: 'Cobranzas: preparando recordatorios…' })
  if (!id) return null
  const total = (moneda: string) => lista.filter((p) => p.moneda === moneda).reduce((t, p) => t + p.monto, 0)

  try {
    const r = await pensarJSON<{ resumen: string; mensajes: { prospecto_id: string; tipo: string; texto: string }[] }>(ctx, {
      modelo: MODELO_RAPIDO,
      maxTokens: 4000,
      esquema: ESQUEMA,
      sistema: `Sos el agente de cobranzas de brixx. Para cada pendiente redactá un mensaje de WhatsApp para el cliente: cordial, breve (2 a 4 oraciones), \
sin sonar a reclamo duro, con el monto y el concepto, ofreciendo pasar los datos de pago si los necesita. Tuteo/voseo rioplatense, firmado "brixx". \
Usá el nombre de pila del contacto si está. resumen: 1 o 2 oraciones para los socios (cuántos y cuánto en total). Un mensaje por pendiente, con su prospecto_id y tipo.`,
      pedido: `<fecha>${fecha}</fecha>\n<pendientes>\n${lista.map((p) => `- prospecto_id ${p.prospecto_id} · ${p.cliente} (contacto: ${p.contacto || 'sin nombre'}) · ${p.tipo} · ${p.detalle}`).join('\n')}\n</pendientes>`,
    })
    const mensajes = lista.map((p) => ({
      ...p,
      texto: r.mensajes.find((m) => m.prospecto_id === p.prospecto_id && m.tipo === p.tipo)?.texto ?? `Hola ${p.contacto || ''}! Te escribimos de brixx: ${p.detalle.toLowerCase()}. Si necesitás los datos de pago, avisanos. ¡Gracias!`,
    }))
    const sumaTotal = ['USD', 'ARS'].map((m) => (total(m) > 0 ? monto(total(m), m) : '')).filter(Boolean).join(' + ')
    await terminarInforme(ctx, id, {
      titulo: `Cobranzas: ${lista.length} ${lista.length === 1 ? 'pendiente' : 'pendientes'} (${sumaTotal})`,
      resumen: r.resumen,
      contenido: lista.map((p) => `- ${p.cliente}: ${p.detalle}`).join('\n'),
      datos: { mensajes },
    })
    await marcarCorrida(ctx, 'cobranzas', `${lista.length} pendientes (${sumaTotal}).`)
    return r.resumen
  } catch (e) {
    // Sin Claude igual queda la lista, con un mensaje base para cada uno
    const mensajes = lista.map((p) => ({ ...p, texto: `Hola ${p.contacto || ''}! Te escribimos de brixx: ${p.detalle.toLowerCase()}. Si necesitás los datos de pago, avisanos. ¡Gracias!` }))
    await terminarInforme(ctx, id, {
      titulo: `Cobranzas: ${lista.length} ${lista.length === 1 ? 'pendiente' : 'pendientes'}`,
      resumen: `Hay ${lista.length} cobros pendientes. (No pude redactar los mensajes con IA: ${e instanceof Error ? e.message : e}.)`,
      contenido: lista.map((p) => `- ${p.cliente}: ${p.detalle}`).join('\n'),
      datos: { mensajes } as Fila,
    })
    await marcarCorrida(ctx, 'cobranzas', `${lista.length} pendientes (mensajes sin IA).`)
    return null
  }
}
