// Herramientas que Claude puede usar: consultas de SOLO LECTURA sobre el hub, su memoria
// (lo único que escribe) y, del lado de Anthropic, búsqueda y lectura web.
import type Anthropic from 'npm:@anthropic-ai/sdk@1.8.0'
import type { Hub } from './datos.ts'
import type { Memoria } from './memoria.ts'

const fecha = { type: 'string', description: 'Fecha en formato AAAA-MM-DD (hora de Argentina).' }
const opcional = (t: Record<string, unknown>) => ({ anyOf: [t, { type: 'null' }] })

function herramienta(name: string, description: string, properties: Record<string, unknown>): Anthropic.Beta.BetaTool {
  return {
    name,
    description,
    strict: true,
    input_schema: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false },
  }
}

export const HERRAMIENTAS: Anthropic.Beta.BetaTool[] = [
  herramienta('agenda', 'Reuniones agendadas y próximas acciones del pipeline entre dos fechas (inclusive). Para "hoy", "mañana", "esta semana", etc.', {
    desde: fecha,
    hasta: fecha,
  }),
  herramienta(
    'buscar_grabaciones',
    'Lista grabaciones de reuniones y audios subidos (por ejemplo, notas de voz de WhatsApp), con su id y resumen, filtrando por cliente, por tema o por fechas. Para leer una completa, después usá leer_grabacion con el id.',
    {
      cliente: opcional({ type: 'string', description: 'Nombre del cliente, empresa o contacto.' }),
      texto: opcional({ type: 'string', description: 'Tema o palabras a buscar en el título, resumen y puntos clave.' }),
      desde: opcional(fecha),
      hasta: opcional(fecha),
      limite: opcional({ type: 'integer', description: 'Cuántas devolver (por defecto 10, máximo 20).' }),
    },
  ),
  herramienta(
    'leer_grabacion',
    'Lee una grabación completa: resumen, puntos clave con citas, decisiones, próximos pasos, propuesta y preguntas pendientes. La transcripción textual solo si hace falta saber exactamente qué se dijo.',
    {
      id: { type: 'string', description: 'Id de la grabación (sale de buscar_grabaciones).' },
      incluir_transcripcion: { type: 'boolean', description: 'true solo si hace falta el texto literal de la reunión.' },
    },
  ),
  herramienta('clientes_y_prospectos', 'Clientes y prospectos (sección Clientes) con etapa, valor, próxima acción, contacto, Instagram, web y notas. Si se busca uno puntual, trae también su carpeta: objetivos y soluciones que le proponemos.', {
    texto: opcional({ type: 'string', description: 'Nombre, empresa o rubro a buscar.' }),
    tipo: { type: 'string', enum: ['clientes', 'prospectos', 'perdidos', 'todos'] },
  }),
  herramienta('cotizaciones', 'Cotizaciones con estado, montos (implementación y abono mensual) e ítems.', {
    cliente: opcional({ type: 'string' }),
    estado: opcional({ type: 'string', enum: ['borrador', 'enviada', 'aceptada', 'rechazada'] }),
  }),
  herramienta('finanzas', 'Cobros de un período (con total en USD y por concepto) y costos fijos del estudio.', {
    desde: fecha,
    hasta: fecha,
  }),
  herramienta('metas', 'Metas por mes y trimestre con el avance real (clientes nuevos e ingreso recurrente).', {}),
  herramienta('catalogo_servicios', 'Servicios del estudio con precios de implementación y abono.', {}),
  herramienta('sistemas_y_demos', 'Sistemas entregados y demos web del estudio (fichas con su URL).', {
    texto: opcional({ type: 'string' }),
  }),
]

/** Memoria de Jarvis: lo único que puede escribir. */
export const HERRAMIENTAS_MEMORIA: Anthropic.Beta.BetaTool[] = [
  herramienta(
    'recordar',
    'Guarda una nota en la memoria de Jarvis para tenerla siempre presente en las próximas charlas. Usala cuando te dicen "recordá…", "acordate…", "anotá…", o cuando aparece un dato duradero que conviene no olvidar (una preferencia, un acuerdo con un cliente, una decisión del estudio).',
    { nota: { type: 'string', description: 'La nota, corta y autocontenida (que se entienda sin la charla). Incluí nombres y fechas si las hay.' } },
  ),
  herramienta('olvidar', 'Borra una nota de la memoria, por su id (aparece entre corchetes en la memoria). Usala cuando te piden olvidar algo o cuando una nota quedó vieja o equivocada.', {
    id: { type: 'string', description: 'Id de la nota.' },
  }),
]

/** Búsqueda y lectura web: corren en los servidores de Anthropic (no hay que ejecutarlas acá). */
export const HERRAMIENTAS_WEB: Anthropic.Beta.BetaToolUnion[] = [
  { type: 'web_search_20260209', name: 'web_search', max_uses: 5, user_location: { type: 'approximate', country: 'AR', timezone: 'America/Argentina/Buenos_Aires' } },
  { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 5 },
]

/** Nombres para mostrar en pantalla mientras consulta */
export const NOMBRE_CONSULTA: Record<string, string> = {
  agenda: 'agenda',
  buscar_grabaciones: 'grabaciones',
  leer_grabacion: 'grabación',
  clientes_y_prospectos: 'clientes',
  cotizaciones: 'cotizaciones',
  finanzas: 'finanzas',
  metas: 'metas',
  catalogo_servicios: 'catálogo',
  sistemas_y_demos: 'sistemas y demos',
  recordar: 'memoria',
  olvidar: 'memoria',
  web_search: 'búsqueda web',
  web_fetch: 'lectura web',
}

type Entrada = Record<string, unknown>
const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

/** Ejecuta una herramienta. Lo único que escribe es la memoria de Jarvis. */
export async function ejecutar(hub: Hub, memoria: Memoria, nombre: string, e: Entrada): Promise<string> {
  switch (nombre) {
    case 'recordar':
      return memoria.recordar(String(e.nota ?? ''))
    case 'olvidar':
      return memoria.olvidar(String(e.id ?? ''))
    case 'agenda':
      return hub.agenda(String(e.desde), String(e.hasta))
    case 'buscar_grabaciones':
      return hub.buscarGrabaciones({
        cliente: s(e.cliente),
        texto: s(e.texto),
        desde: s(e.desde),
        hasta: s(e.hasta),
        limite: typeof e.limite === 'number' ? e.limite : undefined,
      })
    case 'leer_grabacion':
      return hub.leerGrabacion(String(e.id), e.incluir_transcripcion === true)
    case 'clientes_y_prospectos':
      return hub.clientes({ texto: s(e.texto), tipo: (s(e.tipo) as 'clientes' | 'prospectos' | 'perdidos' | 'todos') ?? 'todos' })
    case 'cotizaciones':
      return hub.cotizaciones({ cliente: s(e.cliente), estado: s(e.estado) })
    case 'finanzas':
      return hub.finanzas(String(e.desde), String(e.hasta))
    case 'metas':
      return hub.metas()
    case 'catalogo_servicios':
      return hub.catalogo()
    case 'sistemas_y_demos':
      return hub.fichas(s(e.texto))
    default:
      throw new Error(`Herramienta desconocida: ${nombre}`)
  }
}
