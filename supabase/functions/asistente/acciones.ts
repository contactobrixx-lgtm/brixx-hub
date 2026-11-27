// Acciones de Jarvis: agendar una reunión, cargar la próxima acción, mover de etapa, anotar en la
// carpeta de un cliente y armar una cotización en borrador. NUNCA se ejecutan solas: Jarvis las
// prepara (validadas, con un resumen) y quedan "pendientes" hasta que el socio confirma con el botón
// o diciendo que sí. Vencen a los 30 minutos.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type { Hub } from './datos.ts'

export type TipoAccion = 'agendar_reunion' | 'proxima_accion' | 'mover_etapa' | 'nota_cliente' | 'cotizacion_borrador'

export interface AccionVisible {
  id: string
  tipo: TipoAccion
  resumen: string
  estado: 'pendiente' | 'hecha' | 'cancelada' | 'error'
  resultado?: string | null
  link?: string | null
}

const VENCE_MIN = 30
const ZONA = 'America/Argentina/Buenos_Aires'

// Flujo de 5 etapas (0035): contacto → propuesta → demo (aceptó la propuesta) → implementación → mantenimiento; más "perdido".
export const ETAPAS = ['contacto', 'propuesta', 'demo', 'implementacion', 'mantenimiento', 'perdido'] as const
const ETAPA_LABEL: Record<string, string> = {
  contacto: 'Contacto',
  propuesta: 'Propuesta',
  demo: 'Demo',
  implementacion: 'Implementación',
  mantenimiento: 'Mantenimiento',
  perdido: 'Perdido',
}

const normal = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

/** "jueves 20 de noviembre" */
const fechaLarga = (fecha: string) =>
  new Date(`${fecha}T12:00:00-03:00`).toLocaleDateString('es-AR', { timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '')

const usd = (n: number) => `USD ${Math.round(n).toLocaleString('es-AR')}`

type Fila = Record<string, unknown>
type Entrada = Record<string, unknown>
const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

export class Acciones {
  /** Lo que se preparó o se hizo en esta pregunta, para mostrarlo en pantalla. */
  readonly tocadas: AccionVisible[] = []

  constructor(
    private db: SupabaseClient,
    private hub: Hub,
    private usuario: { email: string; nombre: string },
    private avisar: (a: AccionVisible) => void = () => {},
  ) {}

  private registrar(a: AccionVisible) {
    const i = this.tocadas.findIndex((x) => x.id === a.id)
    if (i >= 0) this.tocadas[i] = a
    else this.tocadas.push(a)
    this.avisar(a)
  }

  /** Busca el cliente por nombre o empresa. Si hay más de uno o ninguno, lanza un error legible para Claude. */
  private async cliente(nombre: string | null): Promise<Fila> {
    if (!nombre) throw new Error('Falta el cliente. Preguntale al socio de qué cliente se trata.')
    const todos = await this.hub.prospectos()
    const ids = await this.hub.idsPorCliente(nombre)
    let candidatos = todos.filter((p) => ids.includes(p.id as string))
    if (candidatos.length > 1) {
      const exacto = candidatos.filter((p) => [p.empresa, p.nombre].some((x) => typeof x === 'string' && normal(x) === normal(nombre)))
      if (exacto.length === 1) candidatos = exacto
    }
    const etiqueta = (p: Fila) => (p.empresa ? `${p.empresa} (${p.nombre})` : String(p.nombre))
    if (!candidatos.length) throw new Error(`No encontré a "${nombre}" entre los clientes y prospectos. Preguntale el nombre exacto.`)
    if (candidatos.length > 1) throw new Error(`Hay varios que coinciden con "${nombre}": ${candidatos.map(etiqueta).join(', ')}. Preguntale cuál.`)
    return candidatos[0]
  }

  private nombre = (p: Fila) => String(p.empresa || p.nombre)

  /** Valida lo que pidió Claude, arma el resumen y la deja pendiente de confirmación. */
  async preparar(tipo: TipoAccion, e: Entrada): Promise<string> {
    const { datos, resumen } = await this.armar(tipo, e)
    const { data, error } = await this.db
      .from('jarvis_acciones')
      .insert({ usuario: this.usuario.email, tipo, datos, resumen })
      .select('id')
      .single()
    if (error) throw new Error(`No se pudo preparar la acción: ${error.message}`)
    this.registrar({ id: data.id as string, tipo, resumen, estado: 'pendiente' })
    return `Acción preparada (id ${data.id}): ${resumen}. NO está hecha: aparece en pantalla para que el socio la confirme. Decile en una oración qué vas a hacer y pedile que confirme.`
  }

  private async armar(tipo: TipoAccion, e: Entrada): Promise<{ datos: Record<string, unknown>; resumen: string }> {
    switch (tipo) {
      case 'agendar_reunion': {
        const titulo = texto(e.titulo)
        const fecha = texto(e.fecha)
        const hora = texto(e.hora)
        if (!titulo) throw new Error('Falta el título de la reunión.')
        if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error('Falta la fecha (AAAA-MM-DD). Preguntala si no la dijeron.')
        if (!hora || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) throw new Error('Falta la hora (HH:MM, 24 h). Preguntala si no la dijeron.')
        const inicio = new Date(`${fecha}T${hora}:00-03:00`)
        if (Number.isNaN(inicio.getTime())) throw new Error('La fecha u hora no es válida.')
        const duracion = typeof e.duracion_min === 'number' && e.duracion_min > 0 ? Math.round(e.duracion_min) : 60
        const nombreCliente = texto(e.cliente)
        const p = nombreCliente ? await this.cliente(nombreCliente) : null
        const lugar = texto(e.lugar)
        return {
          datos: { titulo, inicio: inicio.toISOString(), duracion_min: duracion, prospecto_id: p?.id ?? null, lugar_o_link: lugar },
          resumen: `Agendar «${titulo}»${p ? ` con ${this.nombre(p)}` : ''} el ${fechaLarga(fecha)} a las ${hora} (${duracion} min)${lugar ? `, en ${lugar}` : ''}`,
        }
      }
      case 'proxima_accion': {
        const p = await this.cliente(texto(e.cliente))
        const accion = texto(e.accion)
        if (!accion) throw new Error('Falta la acción a cargar.')
        const fecha = texto(e.fecha)
        if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error('La fecha tiene que ser AAAA-MM-DD.')
        return {
          datos: { prospecto_id: p.id, proxima_accion: accion, fecha_proxima_accion: fecha },
          resumen: `Cargar como próxima acción de ${this.nombre(p)}: «${accion}»${fecha ? ` para el ${fechaLarga(fecha)}` : ''}${p.proxima_accion ? ` (reemplaza «${p.proxima_accion}»)` : ''}`,
        }
      }
      case 'mover_etapa': {
        const p = await this.cliente(texto(e.cliente))
        const etapa = texto(e.etapa)
        if (!etapa || !(ETAPAS as readonly string[]).includes(etapa)) throw new Error('Etapa no válida.')
        if (p.etapa === etapa) throw new Error(`${this.nombre(p)} ya está en ${ETAPA_LABEL[etapa]}.`)
        const motivo = etapa === 'perdido' ? texto(e.motivo_perdida) : null
        return {
          datos: { prospecto_id: p.id, etapa, motivo_perdida: motivo },
          resumen: `Mover a ${this.nombre(p)} de ${ETAPA_LABEL[String(p.etapa)] ?? p.etapa} a ${ETAPA_LABEL[etapa]}${motivo ? ` (motivo: ${motivo})` : ''}`,
        }
      }
      case 'nota_cliente': {
        const p = await this.cliente(texto(e.cliente))
        const nota = texto(e.nota)
        if (!nota) throw new Error('Falta la nota.')
        return { datos: { prospecto_id: p.id, nota: Array.from(nota).slice(0, 1000).join('') }, resumen: `Anotar en la carpeta de ${this.nombre(p)}: «${Array.from(nota).slice(0, 1000).join('')}»` }
      }
      case 'cotizacion_borrador': {
        const p = await this.cliente(texto(e.cliente))
        const pedidos = Array.isArray(e.servicios) ? (e.servicios as Entrada[]) : []
        if (!pedidos.length) throw new Error('Faltan los servicios de la cotización (del catálogo).')
        const { data: catalogo } = await this.db
          .from('servicios')
          .select('id, nombre, descripcion, precio_implementacion, precio_mensual')
          .eq('activo', true)
        const items = pedidos.map((s, i) => {
          const buscado = texto(s.servicio) ?? ''
          const cat =
            (catalogo ?? []).find((c) => c.id === buscado) ??
            (catalogo ?? []).find((c) => normal(c.nombre as string) === normal(buscado)) ??
            (catalogo ?? []).find((c) => normal(c.nombre as string).includes(normal(buscado)) && normal(buscado).length >= 3)
          if (!cat) throw new Error(`"${buscado}" no está en el catálogo. Consultá el catálogo y usá el nombre exacto.`)
          const cantidad = typeof s.cantidad === 'number' && s.cantidad > 0 ? s.cantidad : 1
          return {
            servicio_id: cat.id,
            descripcion: cat.descripcion ? `${cat.nombre} — ${cat.descripcion}` : (cat.nombre as string),
            nombre: cat.nombre as string,
            cantidad,
            precio_implementacion: Number(cat.precio_implementacion) || 0,
            precio_mensual: Number(cat.precio_mensual) || 0,
            orden: i,
          }
        })
        const impl = items.reduce((t, x) => t + x.precio_implementacion * x.cantidad, 0)
        const mes = items.reduce((t, x) => t + x.precio_mensual * x.cantidad, 0)
        const titulo = texto(e.titulo) ?? `Propuesta para ${this.nombre(p)}`
        return {
          datos: { prospecto_id: p.id, titulo, items },
          resumen: `Armar cotización en borrador para ${this.nombre(p)}: ${items.map((x) => (x.cantidad !== 1 ? `${x.cantidad} × ${x.nombre}` : x.nombre)).join(', ')} — ${usd(impl)}${mes ? ` + ${usd(mes)}/mes` : ''}`,
        }
      }
    }
  }

  /** Las pendientes de este socio (para que Claude sepa qué confirmar si dice "sí, dale"). */
  async pendientes(): Promise<string> {
    const desde = new Date(Date.now() - VENCE_MIN * 60_000).toISOString()
    const { data } = await this.db
      .from('jarvis_acciones')
      .select('id, resumen')
      .eq('usuario', this.usuario.email)
      .eq('estado', 'pendiente')
      .gte('created_at', desde)
      .order('created_at')
    return data?.length ? data.map((a) => `- [${a.id}] ${a.resumen}`).join('\n') : '(ninguna)'
  }

  async cancelar(id: string): Promise<string> {
    const { data } = await this.db
      .from('jarvis_acciones')
      .update({ estado: 'cancelada', resultado: 'Cancelada.' })
      .eq('id', id)
      .eq('usuario', this.usuario.email)
      .eq('estado', 'pendiente')
      .select('id, tipo, resumen')
    if (!data?.length) return 'No había una acción pendiente con ese id.'
    this.registrar({ id, tipo: data[0].tipo as TipoAccion, resumen: data[0].resumen as string, estado: 'cancelada', resultado: 'Cancelada.' })
    return 'Cancelada: no se hizo nada.'
  }

  /** Ejecuta una acción pendiente del socio (con el botón o porque dijo que sí). */
  async confirmar(id: string): Promise<AccionVisible> {
    const { data: a, error } = await this.db.from('jarvis_acciones').select('*').eq('id', id).maybeSingle()
    if (error || !a || String(a.usuario).toLowerCase() !== this.usuario.email.toLowerCase()) throw new Error('No encontré esa acción.')
    const base = { id, tipo: a.tipo as TipoAccion, resumen: a.resumen as string }
    if (a.estado !== 'pendiente') return { ...base, estado: a.estado, resultado: a.resultado, link: a.link }
    if (Date.now() - new Date(a.created_at as string).getTime() > VENCE_MIN * 60_000) {
      await this.db.from('jarvis_acciones').update({ estado: 'cancelada', resultado: 'Venció sin confirmar.' }).eq('id', id)
      const r: AccionVisible = { ...base, estado: 'cancelada', resultado: 'Venció sin confirmar: pedímela de nuevo.' }
      this.registrar(r)
      return r
    }
    // Se marca primero para que no se ejecute dos veces (doble toque o botón + voz)
    const { data: tomada } = await this.db.from('jarvis_acciones').update({ estado: 'hecha' }).eq('id', id).eq('estado', 'pendiente').select('id')
    if (!tomada?.length) return { ...base, estado: 'hecha', resultado: 'Ya estaba hecha.' }
    try {
      const { resultado, link } = await this.ejecutar(a.tipo as TipoAccion, a.datos as Record<string, unknown>)
      await this.db.from('jarvis_acciones').update({ resultado, link }).eq('id', id)
      const r: AccionVisible = { ...base, estado: 'hecha', resultado, link }
      this.registrar(r)
      return r
    } catch (e) {
      const resultado = `No se pudo: ${e instanceof Error ? e.message : e}`
      await this.db.from('jarvis_acciones').update({ estado: 'error', resultado }).eq('id', id)
      const r: AccionVisible = { ...base, estado: 'error', resultado }
      this.registrar(r)
      return r
    }
  }

  private async ejecutar(tipo: TipoAccion, d: Record<string, unknown>): Promise<{ resultado: string; link: string }> {
    const ok = <T>(r: { error: { message: string } | null; data?: T }) => {
      if (r.error) throw new Error(r.error.message)
      return r.data as T
    }
    switch (tipo) {
      case 'agendar_reunion': {
        ok(await this.db.from('reuniones').insert({ ...d, responsable: this.usuario.email }))
        return { resultado: 'Listo: quedó agendada.', link: '/calendario' }
      }
      case 'proxima_accion': {
        ok(await this.db.from('prospectos').update({ proxima_accion: d.proxima_accion, fecha_proxima_accion: d.fecha_proxima_accion }).eq('id', d.prospecto_id))
        return { resultado: 'Listo: quedó cargada en el pipeline.', link: `/clientes/${d.prospecto_id}` }
      }
      case 'mover_etapa': {
        const ultimo = ok(await this.db.from('prospectos').select('orden').eq('etapa', d.etapa).order('orden', { ascending: false }).limit(1)) as { orden: number }[]
        const cambios: Record<string, unknown> = { etapa: d.etapa, orden: Number(ultimo?.[0]?.orden ?? 0) + 1 }
        if (d.etapa === 'perdido') cambios.motivo_perdida = d.motivo_perdida ?? null
        ok(await this.db.from('prospectos').update(cambios).eq('id', d.prospecto_id))
        return { resultado: `Listo: pasó a ${ETAPA_LABEL[String(d.etapa)]}.`, link: '/pipeline' }
      }
      case 'nota_cliente': {
        const p = ok(await this.db.from('prospectos').select('notas').eq('id', d.prospecto_id).maybeSingle()) as { notas: string | null } | null
        const fecha = new Date().toLocaleDateString('es-AR', { timeZone: ZONA, day: '2-digit', month: '2-digit' })
        const linea = `[${fecha} · ${this.usuario.nombre}] ${d.nota}`
        ok(await this.db.from('prospectos').update({ notas: p?.notas ? `${p.notas}\n${linea}` : linea }).eq('id', d.prospecto_id))
        return { resultado: 'Listo: quedó anotado en su carpeta.', link: `/clientes/${d.prospecto_id}` }
      }
      case 'cotizacion_borrador': {
        const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: ZONA })
        const vence = new Date(Date.now() + 15 * 864e5).toLocaleDateString('sv-SE', { timeZone: ZONA })
        const cot = ok(
          await this.db
            .from('cotizaciones')
            .insert({ prospecto_id: d.prospecto_id, titulo: d.titulo, estado: 'borrador', fecha: hoy, valida_hasta: vence, moneda: 'USD', descuento_pct: 0 })
            .select('id, numero')
            .single(),
        ) as { id: string; numero: number }
        const items = (d.items as Record<string, unknown>[]).map(({ nombre: _n, ...x }) => ({ ...x, cotizacion_id: cot.id }))
        const r = await this.db.from('cotizacion_items').insert(items)
        if (r.error) {
          await this.db.from('cotizaciones').delete().eq('id', cot.id)
          throw new Error(r.error.message)
        }
        return { resultado: `Listo: armé la cotización COT-${String(cot.numero).padStart(4, '0')} en borrador.`, link: `/propuestas?abrir=${cot.id}` }
      }
    }
  }
}
