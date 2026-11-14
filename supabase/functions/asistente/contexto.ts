// Arma el contexto que se le pasa a Claude: solo los datos que hacen falta para la pregunta.
// Recientes y limitados; la transcripción completa solo si la pregunta la necesita.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

const ZONA = 'America/Argentina/Buenos_Aires'
const GANADAS = ['cerrado', 'implementacion', 'mantenimiento']
const MAX_TRANSCRIPCION = 60_000 // caracteres (~15k tokens)

interface Segmento {
  hablante: string
  inicio_ms: number
  texto: string
}

interface Analisis {
  resumen?: string
  puntos_clave?: { titulo: string; detalle: string; cita?: string }[]
  decisiones?: string[]
  proximos_pasos?: { accion: string; responsable: string | null; fecha: string | null }[]
  propuesta?: { enfoque?: string; servicios?: { nombre: string; etapa: number }[] }
  preguntas_pendientes?: string[]
}

interface Grabacion {
  id: string
  titulo: string
  created_at: string
  duracion_seg: number | null
  estado: string
  prospecto_id: string | null
  reunion_id: string | null
  hablantes: Record<string, string> | null
  analisis: Analisis | null
  segmentos?: Segmento[] | null
}

/** Minúsculas y sin acentos, para comparar palabras. */
export const normalizar = (t: string) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

/** Fecha y hora legible en Argentina. */
function enArgentina(iso: string | Date, conHora = true) {
  return new Date(iso).toLocaleString('es-AR', {
    timeZone: ZONA,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(conHora ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  })
}

/** Fecha YYYY-MM-DD de hoy en Argentina. */
function hoyArgentina(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: ZONA })
}

/** Lunes de esta semana (Argentina) como Date UTC aproximado al inicio del día. */
function lunesArgentina(): Date {
  const hoy = new Date(`${hoyArgentina()}T00:00:00-03:00`)
  const dia = (hoy.getUTCDay() + 6) % 7 // getUTCDay sobre medianoche AR ≈ día local
  return new Date(hoy.getTime() - dia * 864e5)
}

const PIDE_TEXTUAL = /\b(dijo|dijeron|dije|menciono|mencionaron|hablo|hablamos|hablaron|textual|transcripcion|exactamente|palabra|cita|comento|comentaron|pregunto|preguntaron)\b/

/** ¿La pregunta apunta a una reunión o grabación en particular? */
const HABLA_DE_REUNION = /\b(reunion|reuniones|grabacion|grabaciones|grabe|grabamos|llamada|charla|ultima|ultimo)\b/

function mmss(ms: number) {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export async function armarContexto(admin: SupabaseClient, pregunta: string, nombreUsuario: string): Promise<string> {
  const q = normalizar(pregunta)
  const hace30 = new Date(Date.now() - 30 * 864e5).toISOString()
  const hace7 = new Date(Date.now() - 7 * 864e5).toISOString()
  const en14 = new Date(Date.now() + 14 * 864e5).toISOString()
  const hoy = hoyArgentina()

  const [prospectosR, grabacionesR, reunionesR, cotizacionesR, cobrosR, metasR] = await Promise.all([
    admin
      .from('prospectos')
      .select('id, nombre, empresa, rubro, etapa, valor_estimado, moneda, proxima_accion, fecha_proxima_accion, fecha_cierre')
      .neq('etapa', 'perdido')
      .order('updated_at', { ascending: false })
      .limit(40),
    admin
      .from('grabaciones')
      .select('id, titulo, created_at, duracion_seg, estado, prospecto_id, reunion_id, hablantes, analisis')
      .gte('created_at', hace30)
      .order('created_at', { ascending: false })
      .limit(15),
    admin
      .from('reuniones')
      .select('titulo, inicio, duracion_min, prospecto_id, lugar_o_link')
      .gte('inicio', hace7)
      .lte('inicio', en14)
      .order('inicio')
      .limit(25),
    admin
      .from('cotizaciones')
      .select('numero, prospecto_id, titulo, estado, fecha, valida_hasta, moneda, descuento_pct, cotizacion_items(cantidad, precio_implementacion, precio_mensual)')
      .order('fecha', { ascending: false })
      .limit(15),
    admin.from('cobros').select('fecha, monto, moneda, concepto, prospecto_id').gte('fecha', hace30.slice(0, 10)).order('fecha', { ascending: false }).limit(20),
    admin.from('metas').select('tipo, periodo, clientes_nuevos, ingreso_recurrente').lte('periodo', hoy).order('periodo', { ascending: false }).limit(2),
  ])

  const prospectos = prospectosR.data ?? []
  const grabaciones = (grabacionesR.data ?? []) as Grabacion[]
  const porId = new Map(prospectos.map((p) => [p.id as string, p]))
  const nombreDe = (id: string | null) => {
    if (!id) return null
    const p = porId.get(id)
    return p ? (p.empresa as string) || (p.nombre as string) : null
  }

  const partes: string[] = []
  partes.push(`<hoy>${enArgentina(new Date())} (hora de Argentina). Quien pregunta: ${nombreUsuario}.</hoy>`)

  // --- Clientes y prospectos
  const clientes = prospectos.filter((p) => GANADAS.includes(p.etapa as string))
  const abiertos = prospectos.filter((p) => !GANADAS.includes(p.etapa as string))
  const linea = (p: Record<string, unknown>) => {
    const accion = p.proxima_accion
      ? ` | próxima acción: ${p.proxima_accion}${p.fecha_proxima_accion ? ` (${p.fecha_proxima_accion}${(p.fecha_proxima_accion as string) < hoy ? ', VENCIDA' : ''})` : ''}`
      : ''
    const valor = p.valor_estimado != null ? ` | ${p.moneda} ${p.valor_estimado}` : ''
    return `- ${p.empresa ? `${p.empresa} (${p.nombre})` : p.nombre} | etapa: ${p.etapa}${valor}${accion}`
  }
  partes.push(`<clientes cantidad="${clientes.length}">\n${clientes.map(linea).join('\n') || '(ninguno)'}\n</clientes>`)
  partes.push(`<prospectos cantidad="${abiertos.length}">\n${abiertos.map(linea).join('\n') || '(ninguno)'}\n</prospectos>`)

  // --- Reuniones (últimos 7 días y próximos 14)
  const ahora = Date.now()
  const reuniones = reunionesR.data ?? []
  const lunes = lunesArgentina().getTime()
  const reunionesSemana = reuniones.filter((r) => new Date(r.inicio as string).getTime() >= lunes && new Date(r.inicio as string).getTime() <= ahora).length
  partes.push(
    `<reuniones_agendadas desde="hace 7 días" hasta="dentro de 14 días" esta_semana_ya_hechas="${reunionesSemana}">\n${
      reuniones
        .map((r) => {
          const pasada = new Date(r.inicio as string).getTime() < ahora
          return `- ${enArgentina(r.inicio as string)} | ${r.titulo}${nombreDe(r.prospecto_id as string) ? ` | con ${nombreDe(r.prospecto_id as string)}` : ''}${pasada ? ' | (ya pasó)' : ''}`
        })
        .join('\n') || '(ninguna)'
    }\n</reuniones_agendadas>`,
  )

  // --- Grabaciones (últimos 30 días)
  const grabSemana = grabaciones.filter((g) => new Date(g.created_at).getTime() >= lunes).length
  partes.push(
    `<grabaciones ultimos_30_dias="${grabaciones.length}" esta_semana="${grabSemana}">\n${
      grabaciones
        .map((g) => {
          const resumen = g.analisis?.resumen ? ` | resumen: ${g.analisis.resumen.slice(0, 400)}` : g.estado !== 'lista' ? ` | estado: ${g.estado}` : ''
          const pasos = g.analisis?.proximos_pasos?.length
            ? ` | próximos pasos: ${g.analisis.proximos_pasos.map((p) => `${p.accion}${p.responsable ? ` (${p.responsable})` : ''}${p.fecha ? ` [${p.fecha}]` : ''}`).join('; ')}`
            : ''
          const min = g.duracion_seg ? ` | ${Math.round(g.duracion_seg / 60)} min` : ''
          return `- ${enArgentina(g.created_at)} | "${g.titulo}"${nombreDe(g.prospecto_id) ? ` | cliente: ${nombreDe(g.prospecto_id)}` : ''}${min}${resumen}${pasos}`
        })
        .join('\n') || '(ninguna)'
    }\n</grabaciones>`,
  )

  // --- Detalle de UNA grabación si la pregunta apunta a una reunión
  if (grabaciones.length && (HABLA_DE_REUNION.test(q) || PIDE_TEXTUAL.test(q))) {
    // ¿Menciona un cliente o palabras del título? Si no, la más reciente.
    const coincide = (g: Grabacion) => {
      const cliente = normalizar(nombreDe(g.prospecto_id) ?? '')
      const palabrasCliente = cliente.split(/\s+/).filter((w) => w.length >= 4)
      const palabrasTitulo = normalizar(g.titulo).split(/\s+/).filter((w) => w.length >= 5)
      return [...palabrasCliente, ...palabrasTitulo].some((w) => q.includes(w))
    }
    const elegida = grabaciones.find(coincide) ?? grabaciones[0]
    const a = elegida.analisis
    const det: string[] = [`Título: ${elegida.titulo}`, `Fecha: ${enArgentina(elegida.created_at)}`]
    if (nombreDe(elegida.prospecto_id)) det.push(`Cliente: ${nombreDe(elegida.prospecto_id)}`)
    if (a) {
      if (a.resumen) det.push(`Resumen: ${a.resumen}`)
      if (a.puntos_clave?.length) det.push(`Puntos clave:\n${a.puntos_clave.map((p) => `- ${p.titulo}: ${p.detalle}`).join('\n')}`)
      if (a.decisiones?.length) det.push(`Decisiones: ${a.decisiones.join('; ')}`)
      if (a.proximos_pasos?.length)
        det.push(`Próximos pasos:\n${a.proximos_pasos.map((p) => `- ${p.accion}${p.responsable ? ` (responsable: ${p.responsable})` : ''}${p.fecha ? ` [${p.fecha}]` : ''}`).join('\n')}`)
      if (a.propuesta?.enfoque) det.push(`Propuesta de trabajo: ${a.propuesta.enfoque}`)
      if (a.preguntas_pendientes?.length) det.push(`Preguntas pendientes: ${a.preguntas_pendientes.join('; ')}`)
    }
    // Transcripción completa solo si pide lo que se dijo, o si no hay análisis
    if (PIDE_TEXTUAL.test(q) || !a) {
      const { data } = await admin.from('grabaciones').select('segmentos').eq('id', elegida.id).maybeSingle()
      const segs = (data?.segmentos ?? []) as Segmento[]
      if (segs.length) {
        const nombre = (h: string) => elegida.hablantes?.[h] || `Hablante ${h}`
        let texto = segs.map((s) => `[${mmss(s.inicio_ms)}] ${nombre(s.hablante)}: ${s.texto}`).join('\n')
        if (texto.length > MAX_TRANSCRIPCION) texto = `${texto.slice(0, MAX_TRANSCRIPCION)}\n[…transcripción recortada…]`
        det.push(`Transcripción:\n${texto}`)
      } else if (!a) {
        det.push(`Todavía no tiene transcripción (estado: ${elegida.estado}).`)
      }
    }
    partes.push(`<grabacion_en_detalle>\n${det.join('\n')}\n</grabacion_en_detalle>`)
  }

  // --- Cotizaciones recientes
  const cotizaciones = cotizacionesR.data ?? []
  partes.push(
    `<cotizaciones>\n${
      cotizaciones
        .map((c) => {
          const items = (c.cotizacion_items ?? []) as { cantidad: number; precio_implementacion: number; precio_mensual: number }[]
          const impl = items.reduce((t, i) => t + Number(i.cantidad) * Number(i.precio_implementacion), 0) * (1 - Number(c.descuento_pct) / 100)
          const mes = items.reduce((t, i) => t + Number(i.cantidad) * Number(i.precio_mensual), 0)
          const sinRespuesta = c.estado === 'enviada' && ((c.valida_hasta && (c.valida_hasta as string) < hoy) || (c.fecha as string) <= new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10))
          return `- COT-${String(c.numero).padStart(4, '0')} | ${nombreDe(c.prospecto_id as string) ?? 'sin cliente'} | ${c.estado}${sinRespuesta ? ' (sin respuesta hace más de una semana o vencida)' : ''} | ${c.fecha} | ${c.moneda} ${Math.round(impl)}${mes ? ` + ${c.moneda} ${mes}/mes` : ''}`
        })
        .join('\n') || '(ninguna)'
    }\n</cotizaciones>`,
  )

  // --- Cobros del último mes
  const cobros = cobrosR.data ?? []
  partes.push(
    `<cobros_ultimos_30_dias>\n${cobros.map((c) => `- ${c.fecha} | ${nombreDe(c.prospecto_id as string) ?? 'sin cliente'} | ${c.concepto} | ${c.moneda} ${c.monto}`).join('\n') || '(ninguno)'}\n</cobros_ultimos_30_dias>`,
  )

  // --- Metas vigentes
  const metas = metasR.data ?? []
  if (metas.length) {
    const nuevosMes = clientes.filter((p) => (p.fecha_cierre as string | null)?.slice(0, 7) === hoy.slice(0, 7)).length
    partes.push(
      `<metas>\n${metas.map((m) => `- ${m.tipo} que empieza ${m.periodo}: ${m.clientes_nuevos ?? '—'} clientes nuevos, ${m.ingreso_recurrente ?? '—'} USD/mes de ingreso recurrente`).join('\n')}\nClientes nuevos cerrados este mes: ${nuevosMes}.\n</metas>`,
    )
  }

  return partes.join('\n\n')
}
