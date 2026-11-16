// Síntesis por cliente (lo de arriba de la carpeta en la sección Clientes): Claude junta todo lo que
// se sabe de un cliente o prospecto (intervenciones, audios, reuniones grabadas, cotizaciones, notas)
// y lo baja a sus objetivos, las soluciones que le proponemos y qué hacer ahora.
// Se guarda en prospectos.sintesis. Mantener ESQUEMA_SINTESIS en sincronía con `Sintesis` en src/types/db.ts.
import Anthropic from 'npm:@anthropic-ai/sdk@1.8.0'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { MODELO } from './analisis.ts'

const texto = { type: 'string' }
const textoONull = { anyOf: [{ type: 'string' }, { type: 'null' }] }
const lista = (items: unknown) => ({ type: 'array', items })
const objeto = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
})

export const ESQUEMA_SINTESIS = objeto({
  situacion: texto,
  objetivos: lista(texto),
  soluciones: lista(objeto({ solucion: texto, servicio_id: textoONull, servicio: texto })),
  hacer_ahora: lista(objeto({ accion: texto, fecha: textoONull })),
  falta_saber: lista(texto),
})

const SISTEMA = `Sos el socio comercial de brixx, una agencia de IA y soluciones digitales de dos socios en Argentina. \
Te paso todo lo que hay de un cliente o cliente potencial: sus datos, notas, cotizaciones y los análisis de sus intervenciones, \
audios y reuniones. Los socios tienen demasiada información suelta: tu trabajo es dejar la carpeta del cliente clara y accionable. \
Sé muy concreto, frases cortas, y no repitas la misma idea en dos campos.

Qué devolver (español rioplatense, con voseo, sin markdown):
- situacion: en UNA oración, en qué punto estamos con él (qué pasó último y qué está pendiente de quién).
- objetivos: de 1 a 4 objetivos del cliente (el resultado que busca para su negocio, no el servicio), cortos.
- soluciones: de 1 a 4 soluciones digitales que brixx le propone según esos objetivos. En "servicio" el servicio del catálogo \
que la resuelve y en servicio_id su "id" exacto (null si no está en el catálogo). Si ya tiene una cotización aceptada, \
enfocate en lo que sigue (mantenimiento, ampliaciones). No inventes precios.
- hacer_ahora: de 1 a 3 acciones concretas para los socios, la más urgente primero. Verbo al principio \
("Mandarle…", "Llamarlo para…"). "fecha" AAAA-MM-DD si hay un plazo claro (resolvé "el viernes" respecto de hoy), si no null.
- falta_saber: hasta 3 preguntas cortas que destraban la venta o el proyecto. Lista vacía si no falta nada.

Reglas: basate solo en el material. Si algo se contradice, quedate con lo más reciente. Si hay muy poca información, \
decilo en situacion y poné en hacer_ahora cómo conseguirla.`

export interface ResultadoSintesis {
  sintesis: unknown
  modelo: string
}

const fechaAR = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })
const hoyAR = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' })

/** Junta todo lo del cliente en un texto para Claude (exportada para tests). */
export async function armarMaterial(db: SupabaseClient, prospectoId: string): Promise<{ material: string; hay: boolean }> {
  const { data: p, error } = await db.from('prospectos').select('*').eq('id', prospectoId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!p) throw new Error('No existe el cliente.')

  const [{ data: reuniones }, { data: cotizaciones }, { data: servicios }] = await Promise.all([
    db.from('reuniones').select('id, titulo, inicio, notas').eq('prospecto_id', prospectoId).order('inicio'),
    db
      .from('cotizaciones')
      .select('numero, titulo, estado, fecha, descuento_pct, moneda, cotizacion_items(descripcion, cantidad, precio_implementacion, precio_mensual)')
      .eq('prospecto_id', prospectoId)
      .order('fecha'),
    db.from('servicios').select('id, nombre, descripcion, precio_implementacion, precio_mensual').eq('activo', true).order('orden'),
  ])
  const idsReuniones = (reuniones ?? []).map((r) => r.id as string)
  let q = db.from('grabaciones').select('titulo, origen, created_at, analisis, estado').eq('estado', 'lista')
  q = idsReuniones.length ? q.or(`prospecto_id.eq.${prospectoId},reunion_id.in.(${idsReuniones.join(',')})`) : q.eq('prospecto_id', prospectoId)
  const { data: grabaciones } = await q.order('created_at')

  type A = {
    tipo?: string
    en_una_linea?: string
    dolores?: string[]
    cuellos_de_botella?: string[]
    soluciones?: { solucion: string; servicio: string }[]
    falta_saber?: string[]
    lo_que_quiere?: string
    resumen?: string
    puntos_clave?: { titulo: string; detalle: string; tipo: string }[]
    decisiones?: string[]
    proximos_pasos?: { accion: string; fecha: string | null }[]
    preguntas_pendientes?: string[]
  }
  const bloquesGrab = (grabaciones ?? [])
    .filter((g) => g.analisis)
    .slice(-12) // las más recientes alcanzan
    .map((g) => {
      const a = g.analisis as A
      const tipo = g.origen === 'audio' ? 'Audio' : g.origen === 'texto' ? 'Texto (chat o notas)' : 'Reunión grabada'
      return [
        `### ${tipo} del ${fechaAR(g.created_at as string)}: "${g.titulo}"`,
        a.en_una_linea ? `Quiere: ${a.en_una_linea}` : '',
        a.dolores?.length ? `Dolores: ${a.dolores.join('; ')}` : '',
        a.cuellos_de_botella?.length ? `Cuellos de botella: ${a.cuellos_de_botella.join('; ')}` : '',
        a.soluciones?.length ? `Soluciones pensadas: ${a.soluciones.map((x) => `${x.solucion} (${x.servicio})`).join('; ')}` : '',
        a.falta_saber?.length ? `Faltaba saber: ${a.falta_saber.join('; ')}` : '',
        a.lo_que_quiere ? `Quería: ${a.lo_que_quiere}` : '',
        a.resumen ? `Resumen: ${a.resumen}` : '',
        a.puntos_clave?.length ? `Puntos: ${a.puntos_clave.map((x) => `[${x.tipo}] ${x.titulo}: ${x.detalle}`).join(' | ')}` : '',
        a.decisiones?.length ? `Decisiones: ${a.decisiones.join('; ')}` : '',
        a.proximos_pasos?.length ? `Pasos: ${a.proximos_pasos.map((x) => x.accion + (x.fecha ? ` (${x.fecha})` : '')).join('; ')}` : '',
        a.preguntas_pendientes?.length ? `Preguntas: ${a.preguntas_pendientes.join('; ')}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    })

  type Item = { descripcion: string; cantidad: number; precio_implementacion: number; precio_mensual: number }
  const bloquesCot = (cotizaciones ?? []).map((c) => {
    const items = (c.cotizacion_items ?? []) as Item[]
    const impl = items.reduce((t, i) => t + Number(i.precio_implementacion) * Number(i.cantidad), 0) * (1 - Number(c.descuento_pct ?? 0) / 100)
    const mes = items.reduce((t, i) => t + Number(i.precio_mensual) * Number(i.cantidad), 0)
    return `- #${c.numero} "${c.titulo}" (${c.estado}, ${c.fecha}): ${items.map((i) => i.descripcion).join('; ')} — implementación ${c.moneda} ${Math.round(impl)}, abono ${c.moneda} ${Math.round(mes)}/mes`
  })

  const material = `<hoy>${hoyAR()}</hoy>

<cliente>
Nombre: ${p.empresa ? `${p.empresa} (contacto: ${p.nombre})` : p.nombre}
Rubro: ${p.rubro ?? 'sin dato'} · Industria: ${p.industria ?? 'sin dato'}
Etapa en el pipeline: ${p.etapa}
Instagram: ${p.instagram ?? 'sin dato'} · Web: ${p.web ?? 'sin dato'}
Próxima acción cargada: ${p.proxima_accion ? `${p.proxima_accion}${p.fecha_proxima_accion ? ` (${p.fecha_proxima_accion})` : ''}` : 'ninguna'}
Notas: ${p.notas ?? 'sin notas'}
</cliente>

<reuniones_agendadas>
${(reuniones ?? []).map((r) => `- ${fechaAR(r.inicio as string)}: ${r.titulo}${r.notas ? ` — ${r.notas}` : ''}`).join('\n') || '(ninguna)'}
</reuniones_agendadas>

<cotizaciones>
${bloquesCot.join('\n') || '(ninguna)'}
</cotizaciones>

<audios_y_reuniones_analizados>
${bloquesGrab.join('\n\n') || '(ninguno)'}
</audios_y_reuniones_analizados>

<catalogo_de_servicios>
${(servicios ?? []).map((s) => `- id: ${s.id} | ${s.nombre}${s.descripcion ? ` — ${s.descripcion}` : ''} | USD ${Number(s.precio_implementacion)} + USD ${Number(s.precio_mensual)}/mes`).join('\n') || '(vacío)'}
</catalogo_de_servicios>`

  return { material, hay: bloquesGrab.length > 0 || bloquesCot.length > 0 || Boolean(p.notas) }
}

export async function sintetizar(db: SupabaseClient, prospectoId: string): Promise<ResultadoSintesis> {
  const { material } = await armarMaterial(db, prospectoId)
  const client = new Anthropic() // lee ANTHROPIC_API_KEY
  const response = await client.beta.messages.create({
    model: MODELO,
    max_tokens: 8000,
    // Si el modelo rechaza el pedido, la API lo reintenta sola con un modelo de respaldo.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: ESQUEMA_SINTESIS } },
    system: SISTEMA,
    messages: [{ role: 'user', content: material }],
  })
  if (response.stop_reason === 'refusal') throw new Error('Claude no pudo armar el resumen de este cliente (rechazo de seguridad).')
  if (response.stop_reason === 'max_tokens') throw new Error('El resumen del cliente quedó incompleto.')
  const bloque = response.content.find((b) => b.type === 'text')
  if (!bloque || bloque.type !== 'text') throw new Error('Claude no devolvió texto.')
  return { sintesis: JSON.parse(bloque.text), modelo: response.model }
}

/** Arma la síntesis y la guarda en el prospecto. */
export async function sintetizarYGuardar(db: SupabaseClient, prospectoId: string) {
  const { sintesis } = await sintetizar(db, prospectoId)
  const { error } = await db.from('prospectos').update({ sintesis, sintesis_at: new Date().toISOString() }).eq('id', prospectoId)
  if (error) throw new Error(`No se pudo guardar el resumen: ${error.message}`)
  return sintesis
}
