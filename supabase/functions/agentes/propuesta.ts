// Agente "propuesta": con todo lo que se sabe del cliente (carpeta, intervenciones, reuniones) elige
// servicios del catálogo, arma la cotización en BORRADOR (precios del catálogo, como siempre) y redacta
// el mensaje para mandársela. Lo dispara un socio con un botón: no manda nada al cliente.
import { conInforme, empezarInforme, marcarCorrida, nombreCliente, pensarJSON, type Contexto, type Fila } from './comun.ts'

const ESQUEMA = {
  type: 'object',
  properties: {
    titulo: { type: 'string' },
    resumen: { type: 'string' },
    por_que: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { servicio_id: { type: 'string' }, cantidad: { type: 'integer' }, para_que: { type: 'string' } },
        required: ['servicio_id', 'cantidad', 'para_que'],
        additionalProperties: false,
      },
    },
    descuento_pct: { type: 'number' },
    notas: { type: 'string' },
    mensaje: { type: 'string' },
  },
  required: ['titulo', 'resumen', 'por_que', 'items', 'descuento_pct', 'notas', 'mensaje'],
  additionalProperties: false,
}

interface Salida {
  titulo: string
  resumen: string
  por_que: string
  items: { servicio_id: string; cantidad: number; para_que: string }[]
  descuento_pct: number
  notas: string
  mensaje: string
}

const usd = (n: number) => `US$ ${Math.round(n).toLocaleString('es-AR')}`

/** Arma la propuesta de un cliente (y, si viene, a partir de una intervención puntual). */
export async function armarPropuesta(
  ctx: Contexto,
  prospectoId: string,
  grabacionId: string | null,
  /** Pide los textos de la propuesta (formato Alcione) para la cotización recién creada */
  textos?: (cotizacionId: string) => Promise<void>,
): Promise<{ id: string; trabajo: Promise<void> }> {
  const p = (await ctx.hub.prospectos()).find((x) => x.id === prospectoId)
  if (!p) throw new Error('No encontré ese cliente.')
  const cliente = nombreCliente(p)
  const id = await empezarInforme(ctx, 'propuesta', null, { titulo: `Propuesta para ${cliente}`, prospecto_id: prospectoId })
  if (!id) throw new Error('No se pudo crear el informe.')

  const trabajo = conInforme(ctx, id, async () => {
    const [{ data: catalogo }, carpeta, grabaciones, intervencion] = await Promise.all([
      ctx.db.from('servicios').select('id, nombre, descripcion, precio_implementacion, precio_mensual').eq('activo', true).order('orden'),
      ctx.hub.clientes({ texto: cliente, tipo: 'todos' }),
      ctx.hub.buscarGrabaciones({ cliente, limite: 6 }),
      grabacionId ? ctx.hub.leerGrabacion(grabacionId, false) : Promise.resolve(''),
    ])
    if (!catalogo?.length) throw new Error('El catálogo de servicios está vacío: cargá servicios en Propuestas.')

    const r = await pensarJSON<Salida>(ctx, {
      esquema: ESQUEMA,
      timeoutMs: 100_000,
      sistema: `Sos el agente que arma propuestas comerciales de brixx. Con lo que se sabe del cliente, elegí del catálogo SOLO los servicios \
que resuelven sus dolores concretos (normalmente 1 a 3; no infles la propuesta). Usá el servicio_id exacto del catálogo.
- titulo: nombre corto de la propuesta (ej. "Bot de WhatsApp y tienda online").
- items: cada servicio con cantidad y para_que (una oración: qué problema del cliente resuelve).
- por_que: 2 a 4 oraciones con la lógica de la propuesta, para los socios.
- descuento_pct: 0 salvo que haya un motivo claro en lo que se sabe (por ejemplo, lo pidió o se acordó); máximo 15.
- notas: condiciones para la cotización (forma de pago sugerida: 50% de anticipo y 50% contra entrega, plazos estimados).
- mensaje: el WhatsApp para mandarle la propuesta: cálido, concreto, con lo que va a lograr (no la lista de precios), voseo, firmado "brixx".
- resumen: 1 o 2 oraciones para decir en voz alta (qué se le propone y por cuánto).`,
      pedido: `<cliente>${cliente}</cliente>
<carpeta>\n${carpeta}\n</carpeta>
<intervenciones_y_reuniones>\n${grabaciones}\n</intervenciones_y_reuniones>
${intervencion ? `<intervencion_elegida>\n${intervencion}\n</intervencion_elegida>\n` : ''}<catalogo>
${catalogo.map((s) => `- servicio_id ${s.id} · ${s.nombre}: ${s.descripcion ?? ''} (implementación US$ ${s.precio_implementacion}, abono US$ ${s.precio_mensual}/mes)`).join('\n')}
</catalogo>`,
    })

    // Ítems con el precio del catálogo (snapshot, como en el cotizador)
    const porId = new Map(catalogo.map((s) => [s.id as string, s]))
    const elegidos = r.items.filter((i) => porId.has(i.servicio_id))
    if (!elegidos.length) throw new Error('No eligió servicios del catálogo.')
    const items = elegidos.map((i, orden) => {
      const s = porId.get(i.servicio_id) as Fila
      return {
        servicio_id: s.id,
        descripcion: s.descripcion ? `${s.nombre} — ${s.descripcion}` : String(s.nombre),
        cantidad: Math.max(1, Math.round(i.cantidad || 1)),
        precio_implementacion: Number(s.precio_implementacion) || 0,
        precio_mensual: Number(s.precio_mensual) || 0,
        orden,
      }
    })
    const descuento = Math.min(15, Math.max(0, Number(r.descuento_pct) || 0))
    const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' })
    const vence = new Date(Date.now() + 15 * 864e5).toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' })
    const { data: cot, error } = await ctx.db
      .from('cotizaciones')
      .insert({ prospecto_id: prospectoId, titulo: r.titulo, estado: 'borrador', fecha: hoy, valida_hasta: vence, moneda: 'USD', descuento_pct: descuento, notas: r.notas })
      .select('id, numero')
      .single()
    if (error) throw new Error(error.message)
    const ins = await ctx.db.from('cotizacion_items').insert(items.map((x) => ({ ...x, cotizacion_id: cot.id })))
    if (ins.error) {
      await ctx.db.from('cotizaciones').delete().eq('id', cot.id)
      throw new Error(ins.error.message)
    }

    await textos?.(cot.id).catch((e) => console.error('Textos de la propuesta:', e))

    const impl = items.reduce((t, x) => t + x.precio_implementacion * x.cantidad, 0) * (1 - descuento / 100)
    const mes = items.reduce((t, x) => t + x.precio_mensual * x.cantidad, 0)
    const numero = `COT-${String(cot.numero).padStart(4, '0')}`
    await marcarCorrida(ctx, 'propuesta', `${numero} para ${cliente}.`)
    return {
      titulo: `Propuesta para ${cliente}: ${r.titulo} (${numero})`,
      resumen: r.resumen,
      contenido: [
        'QUÉ LE PROPONEMOS',
        ...elegidos.map((i) => `- ${String(porId.get(i.servicio_id)?.nombre)}: ${i.para_que}`),
        '',
        `TOTAL: ${usd(impl)} de implementación${descuento ? ` (con ${descuento}% de descuento)` : ''}${mes ? ` + ${usd(mes)} por mes` : ''}`,
        '',
        'POR QUÉ',
        r.por_que,
        '',
        `La propuesta ${numero} quedó en borrador en Propuestas (los textos se terminan de escribir en un minuto): revisala y mandala.`,
      ].join('\n'),
      prospecto_id: prospectoId,
      datos: {
        cotizacion_id: cot.id,
        numero,
        mensajes: [{ prospecto_id: prospectoId, cliente, contacto: p.nombre, telefono: p.telefono ?? null, tipo: 'propuesta', texto: r.mensaje }],
      },
    }
  })
  return { id, trabajo }
}
