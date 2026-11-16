// Consultas de SOLO LECTURA a la base del hub, para las herramientas del asistente.
// Cada función devuelve texto compacto y legible para el modelo (no JSON crudo de la base).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export const ZONA = 'America/Argentina/Buenos_Aires'
const GANADAS = ['cerrado', 'implementacion', 'mantenimiento']
const MAX_TRANSCRIPCION = 60_000 // caracteres (~15k tokens)

/** Minúsculas y sin acentos, para comparar palabras. */
export const normalizar = (t: string) =>
  (t ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

export function hoyAR(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: ZONA })
}

export function fechaHoraAR(iso: string | Date, conHora = true) {
  return new Date(iso).toLocaleString('es-AR', {
    timeZone: ZONA,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(conHora ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  })
}

/** Inicio y fin (exclusivo) en UTC de un rango de días de Argentina (UTC-3). */
function rangoUTC(desde: string, hasta: string) {
  return { ini: new Date(`${desde}T00:00:00-03:00`).toISOString(), fin: new Date(new Date(`${hasta}T00:00:00-03:00`).getTime() + 864e5).toISOString() }
}

const corto = (t: string | null | undefined, n: number) => (!t ? '' : t.length > n ? `${t.slice(0, n)}…` : t)

type Fila = Record<string, unknown>

/** Contexto compartido por las herramientas de una misma pregunta (se carga una vez). */
export class Hub {
  private prospectosCache: Fila[] | null = null
  constructor(private db: SupabaseClient) {}

  async prospectos(): Promise<Fila[]> {
    if (!this.prospectosCache) {
      const { data } = await this.db
        .from('prospectos')
        .select('id, nombre, empresa, rubro, telefono, email, etapa, valor_estimado, moneda, responsable, proxima_accion, fecha_proxima_accion, fecha_cierre, motivo_perdida, notas')
        .order('updated_at', { ascending: false })
      this.prospectosCache = data ?? []
    }
    return this.prospectosCache
  }

  async nombreDe(id: unknown): Promise<string | null> {
    if (!id) return null
    const p = (await this.prospectos()).find((x) => x.id === id)
    return p ? ((p.empresa as string) || (p.nombre as string)) : null
  }

  /** Ids de prospectos cuyo nombre o empresa contiene el texto. */
  async idsPorCliente(texto: string): Promise<string[]> {
    const q = normalizar(texto).trim()
    if (!q) return []
    return (await this.prospectos())
      .filter((p) => normalizar(`${p.empresa ?? ''} ${p.nombre ?? ''}`).includes(q) || q.includes(normalizar((p.empresa as string) ?? '¬¬')))
      .map((p) => p.id as string)
  }

  async tipoCambio(): Promise<number | null> {
    const { data } = await this.db.from('ajustes').select('tipo_cambio_usd').maybeSingle()
    return data?.tipo_cambio_usd ? Number(data.tipo_cambio_usd) : null
  }

  // ---------------------------------------------------------------- agenda
  async agenda(desde: string, hasta: string): Promise<string> {
    const { ini, fin } = rangoUTC(desde, hasta)
    const { data: reuniones } = await this.db
      .from('reuniones')
      .select('titulo, inicio, duracion_min, prospecto_id, lugar_o_link, notas')
      .gte('inicio', ini)
      .lt('inicio', fin)
      .order('inicio')
      .limit(60)
    const acciones = (await this.prospectos()).filter(
      (p) => p.etapa !== 'perdido' && p.fecha_proxima_accion && (p.fecha_proxima_accion as string) >= desde && (p.fecha_proxima_accion as string) <= hasta,
    )
    const lineasR = await Promise.all(
      (reuniones ?? []).map(
        async (r) =>
          `- ${fechaHoraAR(r.inicio as string)} | reunión: ${r.titulo} (${r.duracion_min} min)${(await this.nombreDe(r.prospecto_id)) ? ` | con ${await this.nombreDe(r.prospecto_id)}` : ''}${r.lugar_o_link ? ` | ${r.lugar_o_link}` : ''}${r.notas ? ` | notas: ${corto(r.notas as string, 200)}` : ''}`,
      ),
    )
    const lineasA = acciones.map((p) => `- ${p.fecha_proxima_accion} | próxima acción con ${p.empresa || p.nombre}: ${p.proxima_accion}`)
    return `Agenda del ${desde} al ${hasta}:\n${[...lineasR, ...lineasA].join('\n') || '(nada agendado)'}`
  }

  // ---------------------------------------------------------- grabaciones
  async buscarGrabaciones(o: { texto?: string; cliente?: string; desde?: string; hasta?: string; limite?: number }): Promise<string> {
    let q = this.db
      .from('grabaciones')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
    if (o.desde) q = q.gte('created_at', rangoUTC(o.desde, o.desde).ini)
    if (o.hasta) q = q.lt('created_at', rangoUTC(o.hasta, o.hasta).fin)
    const { data } = await q
    let filas = data ?? []
    if (o.cliente) {
      const ids = await this.idsPorCliente(o.cliente)
      const c = normalizar(o.cliente)
      filas = filas.filter((g) => ids.includes(g.prospecto_id as string) || normalizar(g.titulo as string).includes(c))
    }
    if (o.texto) {
      const palabras = normalizar(o.texto).split(/\s+/).filter((w) => w.length >= 3)
      filas = filas.filter((g) => {
        const a = g.analisis as { lo_que_quiere?: string; resumen?: string; puntos_clave?: { titulo: string; detalle: string }[] } | null
        const t = normalizar(`${g.titulo} ${g.origen === 'audio' ? 'audio whatsapp mensaje' : ''} ${a?.lo_que_quiere ?? ''} ${a?.resumen ?? ''} ${(a?.puntos_clave ?? []).map((p) => `${p.titulo} ${p.detalle}`).join(' ')}`)
        return palabras.some((w) => t.includes(w))
      })
    }
    filas = filas.slice(0, Math.min(o.limite ?? 10, 20))
    if (!filas.length) return 'No encontré grabaciones con esos criterios.'
    const lineas = await Promise.all(
      filas.map(async (g) => {
        const a = g.analisis as { resumen?: string; lo_que_quiere?: string } | null
        const cliente = await this.nombreDe(g.prospecto_id)
        const tipo = g.origen === 'audio' ? 'audio subido' : 'reunión'
        return `- id ${g.id} | ${tipo} | ${fechaHoraAR(g.created_at as string)} | "${g.titulo}"${cliente ? ` | cliente: ${cliente}` : ''}${g.duracion_seg ? ` | ${Math.round((g.duracion_seg as number) / 60)} min` : ''} | estado: ${g.estado}${a?.lo_que_quiere ? ` | quiere: ${corto(a.lo_que_quiere, 200)}` : ''}${a?.resumen ? ` | resumen: ${corto(a.resumen, 300)}` : ''}`
      }),
    )
    return `Grabaciones (de la más nueva a la más vieja):\n${lineas.join('\n')}`
  }

  async leerGrabacion(id: string, conTranscripcion: boolean): Promise<string> {
    const { data: g } = await this.db
      .from('grabaciones')
      .select('*') // incluye "origen" (reunión o audio subido)
      .eq('id', id)
      .maybeSingle()
    if (!g) return 'No existe una grabación con ese id. Buscala primero con buscar_grabaciones.'
    const a = g.analisis as {
      lo_que_quiere?: string
      respuesta_sugerida?: string
      resumen?: string
      puntos_clave?: { titulo: string; detalle: string; tipo: string; cita: string }[]
      decisiones?: string[]
      proximos_pasos?: { accion: string; responsable: string | null; fecha: string | null }[]
      propuesta?: { enfoque: string; servicios: { nombre: string; motivo: string; etapa: number }[]; riesgos: string[] }
      preguntas_pendientes?: string[]
    } | null
    const tipo = g.origen === 'audio' ? 'Audio subido (por ejemplo, de WhatsApp)' : 'Grabación de reunión'
    const out = [`${tipo} "${g.titulo}" del ${fechaHoraAR(g.created_at as string)}`, `Estado: ${g.estado}${g.error ? ` (${g.error})` : ''}`]
    const cliente = await this.nombreDe(g.prospecto_id)
    if (cliente) out.push(`Cliente: ${cliente}`)
    if (a) {
      if (a.lo_que_quiere) out.push(`Lo que quiere: ${a.lo_que_quiere}`)
      if (a.respuesta_sugerida) out.push(`Respuesta sugerida: ${a.respuesta_sugerida}`)
      out.push(`Resumen: ${a.resumen}`)
      if (a.puntos_clave?.length) out.push(`Puntos clave:\n${a.puntos_clave.map((p) => `- [${p.tipo}] ${p.titulo}: ${p.detalle} (cita: "${p.cita}")`).join('\n')}`)
      if (a.decisiones?.length) out.push(`Decisiones: ${a.decisiones.join('; ')}`)
      if (a.proximos_pasos?.length) out.push(`Próximos pasos:\n${a.proximos_pasos.map((p) => `- ${p.accion}${p.responsable ? ` (${p.responsable})` : ''}${p.fecha ? ` [${p.fecha}]` : ''}`).join('\n')}`)
      if (a.propuesta) {
        out.push(`Propuesta: ${a.propuesta.enfoque}`)
        if (a.propuesta.servicios?.length) out.push(`Servicios sugeridos: ${a.propuesta.servicios.map((s) => `${s.nombre} (etapa ${s.etapa}): ${s.motivo}`).join('; ')}`)
        if (a.propuesta.riesgos?.length) out.push(`Riesgos: ${a.propuesta.riesgos.join('; ')}`)
      }
      if (a.preguntas_pendientes?.length) out.push(`Preguntas pendientes: ${a.preguntas_pendientes.join('; ')}`)
    } else {
      out.push('Todavía no tiene análisis.')
    }
    const segs = (g.segmentos ?? []) as { hablante: string; inicio_ms: number; texto: string }[]
    if ((conTranscripcion || !a) && segs.length) {
      const h = (g.hablantes ?? {}) as Record<string, string>
      const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`
      let t = segs.map((s) => `[${mmss(s.inicio_ms)}] ${h[s.hablante] || `Hablante ${s.hablante}`}: ${s.texto}`).join('\n')
      if (t.length > MAX_TRANSCRIPCION) t = `${t.slice(0, MAX_TRANSCRIPCION)}\n[…recortada…]`
      out.push(`Transcripción:\n${t}`)
    } else if (!segs.length) {
      out.push('No tiene transcripción.')
    }
    return out.join('\n')
  }

  // ------------------------------------------------------ clientes/prospectos
  async clientes(o: { texto?: string; tipo?: 'clientes' | 'prospectos' | 'perdidos' | 'todos' }): Promise<string> {
    let filas = await this.prospectos()
    const tipo = o.tipo ?? 'todos'
    if (tipo === 'clientes') filas = filas.filter((p) => GANADAS.includes(p.etapa as string))
    if (tipo === 'prospectos') filas = filas.filter((p) => !GANADAS.includes(p.etapa as string) && p.etapa !== 'perdido')
    if (tipo === 'perdidos') filas = filas.filter((p) => p.etapa === 'perdido')
    if (tipo === 'todos') filas = filas.filter((p) => p.etapa !== 'perdido' || o.texto)
    if (o.texto) {
      const ids = await this.idsPorCliente(o.texto)
      const t = normalizar(o.texto)
      filas = filas.filter((p) => ids.includes(p.id as string) || normalizar(`${p.rubro ?? ''}`).includes(t))
    }
    filas = filas.slice(0, 60)
    if (!filas.length) return 'No encontré clientes ni prospectos con ese criterio.'
    const hoy = hoyAR()
    return filas
      .map(
        (p) =>
          `- ${p.empresa ? `${p.empresa} (contacto: ${p.nombre})` : p.nombre} | etapa: ${p.etapa}${p.rubro ? ` | rubro: ${p.rubro}` : ''}${p.valor_estimado != null ? ` | valor: ${p.moneda} ${p.valor_estimado}` : ''}${p.fecha_cierre ? ` | cliente desde ${p.fecha_cierre}` : ''}${p.proxima_accion ? ` | próxima acción: ${p.proxima_accion}${p.fecha_proxima_accion ? ` (${p.fecha_proxima_accion}${(p.fecha_proxima_accion as string) < hoy ? ', VENCIDA' : ''})` : ''}` : ''}${p.responsable ? ` | responsable: ${p.responsable}` : ''}${p.telefono ? ` | tel: ${p.telefono}` : ''}${p.motivo_perdida ? ` | motivo de pérdida: ${p.motivo_perdida}` : ''}${p.notas ? ` | notas: ${corto(p.notas as string, 300)}` : ''}`,
      )
      .join('\n')
  }

  // -------------------------------------------------------------- cotizaciones
  private totales(c: Fila) {
    const items = (c.cotizacion_items ?? []) as { cantidad: number; precio_implementacion: number; precio_mensual: number; descripcion: string }[]
    const impl = items.reduce((t, i) => t + Number(i.cantidad) * Number(i.precio_implementacion), 0) * (1 - Number(c.descuento_pct ?? 0) / 100)
    const mes = items.reduce((t, i) => t + Number(i.cantidad) * Number(i.precio_mensual), 0)
    return { impl: Math.round(impl), mes, items }
  }

  async cotizaciones(o: { cliente?: string; estado?: string }): Promise<string> {
    let q = this.db
      .from('cotizaciones')
      .select('id, numero, prospecto_id, titulo, estado, fecha, valida_hasta, moneda, descuento_pct, notas, cotizacion_items(descripcion, cantidad, precio_implementacion, precio_mensual)')
      .order('fecha', { ascending: false })
      .limit(40)
    if (o.estado) q = q.eq('estado', o.estado)
    if (o.cliente) {
      const ids = await this.idsPorCliente(o.cliente)
      if (!ids.length) return 'No encontré ese cliente.'
      q = q.in('prospecto_id', ids)
    }
    const { data } = await q
    if (!data?.length) return 'No hay cotizaciones con ese criterio.'
    const lineas = await Promise.all(
      data.map(async (c) => {
        const t = this.totales(c)
        return `- COT-${String(c.numero).padStart(4, '0')} | ${(await this.nombreDe(c.prospecto_id)) ?? 'sin cliente'} | ${c.titulo ?? ''} | ${c.estado} | ${c.fecha}${c.valida_hasta ? ` (válida hasta ${c.valida_hasta})` : ''} | implementación ${c.moneda} ${t.impl}${t.mes ? ` + ${c.moneda} ${t.mes}/mes` : ''} | ítems: ${t.items.map((i) => corto(i.descripcion, 60)).join('; ')}`
      }),
    )
    return lineas.join('\n')
  }

  // ----------------------------------------------------------------- finanzas
  async finanzas(desde: string, hasta: string): Promise<string> {
    const tc = await this.tipoCambio()
    const usd = (monto: number, moneda: string) => (moneda === 'USD' ? Number(monto) : tc ? Number(monto) / tc : null)
    const [{ data: cobros }, { data: costos }] = await Promise.all([
      this.db.from('cobros').select('fecha, monto, moneda, concepto, prospecto_id, notas').gte('fecha', desde).lte('fecha', hasta).order('fecha'),
      this.db.from('costos').select('nombre, categoria, monto, moneda, frecuencia, desde, hasta'),
    ])
    let total = 0
    const porConcepto: Record<string, number> = {}
    const lineas = await Promise.all(
      (cobros ?? []).map(async (c) => {
        const v = usd(c.monto as number, c.moneda as string)
        if (v != null) {
          total += v
          porConcepto[c.concepto as string] = (porConcepto[c.concepto as string] ?? 0) + v
        }
        return `- ${c.fecha} | ${(await this.nombreDe(c.prospecto_id)) ?? 'sin cliente'} | ${c.concepto} | ${c.moneda} ${c.monto}`
      }),
    )
    const vigentes = (costos ?? []).filter((c) => (c.desde as string) <= hasta && (!c.hasta || (c.hasta as string) >= desde))
    const costoMensual = vigentes
      .filter((c) => c.frecuencia !== 'unico')
      .reduce((t, c) => t + (usd(c.frecuencia === 'anual' ? Number(c.monto) / 12 : Number(c.monto), c.moneda as string) ?? 0), 0)
    return [
      `Finanzas del ${desde} al ${hasta} (montos convertidos a USD${tc ? ` con 1 USD = ${tc} ARS` : '; sin tipo de cambio cargado, lo que está en pesos no se suma'}):`,
      `Cobrado: USD ${Math.round(total)}${Object.keys(porConcepto).length ? ` (${Object.entries(porConcepto).map(([k, v]) => `${k}: ${Math.round(v)}`).join(', ')})` : ''}`,
      `Cobros:\n${lineas.join('\n') || '(ninguno)'}`,
      `Costos fijos vigentes: unos USD ${Math.round(costoMensual)} por mes. Detalle: ${vigentes.map((c) => `${c.nombre} (${c.categoria}, ${c.frecuencia}, ${c.moneda} ${c.monto})`).join('; ') || 'ninguno'}`,
    ].join('\n')
  }

  // ----------------------------------------------------------------- metas
  async metas(): Promise<string> {
    const hoy = hoyAR()
    const [{ data: metas }, { data: aceptadas }] = await Promise.all([
      this.db.from('metas').select('tipo, periodo, clientes_nuevos, ingreso_recurrente').order('periodo'),
      this.db.from('cotizaciones').select('prospecto_id, moneda, descuento_pct, cotizacion_items(cantidad, precio_implementacion, precio_mensual)').eq('estado', 'aceptada'),
    ])
    const prospectos = await this.prospectos()
    const activos = new Set(prospectos.filter((p) => ['implementacion', 'mantenimiento'].includes(p.etapa as string)).map((p) => p.id))
    const tc = await this.tipoCambio()
    const mrr = (aceptadas ?? [])
      .filter((c) => activos.has(c.prospecto_id))
      .reduce((t, c) => {
        const m = this.totales(c).mes
        return t + (c.moneda === 'USD' ? m : tc ? m / tc : 0)
      }, 0)
    const fin = (tipo: string, periodo: string) => {
      const d = new Date(`${periodo}T00:00:00Z`)
      d.setUTCMonth(d.getUTCMonth() + (tipo === 'mes' ? 1 : 3))
      d.setUTCDate(d.getUTCDate() - 1)
      return d.toISOString().slice(0, 10)
    }
    const lineas = (metas ?? []).map((m) => {
      const hasta = fin(m.tipo as string, m.periodo as string)
      const nuevos = prospectos.filter(
        (p) => GANADAS.includes(p.etapa as string) && p.fecha_cierre && (p.fecha_cierre as string) >= (m.periodo as string) && (p.fecha_cierre as string) <= hasta,
      )
      const vigente = (m.periodo as string) <= hoy && hoy <= hasta ? ' (VIGENTE)' : ''
      return `- ${m.tipo} del ${m.periodo} al ${hasta}${vigente}: meta ${m.clientes_nuevos ?? '—'} clientes nuevos (van ${nuevos.length}${nuevos.length ? `: ${nuevos.map((p) => p.empresa || p.nombre).join(', ')}` : ''}), meta de ingreso recurrente USD ${m.ingreso_recurrente ?? '—'}/mes`
    })
    return `Hoy es ${hoy}. Ingreso recurrente actual: USD ${Math.round(mrr)}/mes.\nMetas:\n${lineas.join('\n') || '(no hay metas cargadas)'}`
  }

  // ------------------------------------------------------- catálogo y fichas
  async catalogo(): Promise<string> {
    const { data } = await this.db.from('servicios').select('nombre, descripcion, precio_implementacion, precio_mensual, activo').order('orden')
    return (data ?? []).map((s) => `- ${s.nombre}${s.activo ? '' : ' (inactivo)'} | implementación USD ${s.precio_implementacion} | abono USD ${s.precio_mensual}/mes${s.descripcion ? ` | ${corto(s.descripcion as string, 150)}` : ''}`).join('\n') || '(catálogo vacío)'
  }

  async fichas(texto?: string): Promise<string> {
    const { data } = await this.db.from('fichas').select('seccion, nombre, cliente, categoria, descripcion, url, estado').order('seccion').order('orden')
    let filas = data ?? []
    if (texto) {
      const t = normalizar(texto)
      filas = filas.filter((f) => normalizar(`${f.nombre} ${f.cliente ?? ''} ${f.categoria ?? ''} ${f.descripcion ?? ''}`).includes(t))
    }
    return filas.map((f) => `- [${f.seccion === 'sistema' ? 'sistema' : 'demo'}] ${f.nombre}${f.cliente ? ` | cliente: ${f.cliente}` : ''}${f.categoria ? ` | ${f.categoria}` : ''} | ${f.estado} | ${f.url}${f.descripcion ? ` | ${corto(f.descripcion as string, 150)}` : ''}`).join('\n') || 'No hay fichas con ese criterio.'
  }

  // ------------------------------------------------- panorama de hoy (siempre)
  async panorama(nombreUsuario: string): Promise<string> {
    const hoy = hoyAR()
    const prospectos = await this.prospectos()
    const { ini, fin } = rangoUTC(hoy, hoy)
    const hace7 = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)
    const [{ data: reunionesHoy }, { data: enviadas }, { data: pendientesGrab }] = await Promise.all([
      this.db.from('reuniones').select('titulo, inicio, prospecto_id, lugar_o_link').gte('inicio', ini).lt('inicio', fin).order('inicio'),
      this.db.from('cotizaciones').select('numero, prospecto_id, fecha, valida_hasta').eq('estado', 'enviada'),
      this.db.from('grabaciones').select('titulo, estado').in('estado', ['pendiente', 'error']).limit(10),
    ])
    const vencidas = prospectos.filter((p) => p.etapa !== 'perdido' && p.fecha_proxima_accion && (p.fecha_proxima_accion as string) < hoy)
    const deHoy = prospectos.filter((p) => p.etapa !== 'perdido' && p.fecha_proxima_accion === hoy)
    const sinRespuesta = (enviadas ?? []).filter((c) => (c.fecha as string) <= hace7 || (c.valida_hasta && (c.valida_hasta as string) < hoy))
    const n = async (id: unknown) => (await this.nombreDe(id)) ?? 'sin cliente'
    const out = [
      `Ahora: ${fechaHoraAR(new Date())} (hora de Argentina, fecha ${hoy}). Habla con vos: ${nombreUsuario}.`,
      `Reuniones de hoy: ${
        (
          await Promise.all((reunionesHoy ?? []).map(async (r) => `${fechaHoraAR(r.inicio as string)} ${r.titulo}${r.prospecto_id ? ` con ${await n(r.prospecto_id)}` : ''}`))
        ).join('; ') || 'ninguna'
      }.`,
      `Próximas acciones para hoy: ${deHoy.map((p) => `${p.empresa || p.nombre}: ${p.proxima_accion}`).join('; ') || 'ninguna'}.`,
      `Próximas acciones vencidas: ${vencidas.map((p) => `${p.empresa || p.nombre}: ${p.proxima_accion} (desde ${p.fecha_proxima_accion})`).join('; ') || 'ninguna'}.`,
      `Cotizaciones enviadas sin respuesta hace más de una semana: ${(await Promise.all(sinRespuesta.map(async (c) => `COT-${String(c.numero).padStart(4, '0')} de ${await n(c.prospecto_id)}`))).join('; ') || 'ninguna'}.`,
      `Grabaciones sin procesar o con error: ${(pendientesGrab ?? []).map((g) => `"${g.titulo}" (${g.estado})`).join('; ') || 'ninguna'}.`,
      `Clientes activos: ${prospectos.filter((p) => GANADAS.includes(p.etapa as string)).map((p) => `${p.empresa || p.nombre} (${p.etapa})`).join(', ') || 'ninguno'}.`,
    ]
    return out.join('\n')
  }
}
