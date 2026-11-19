// Herramientas que Claude puede usar: consultas de SOLO LECTURA sobre el hub, su memoria,
// acciones que el socio tiene que confirmar antes de que se hagan y, del lado de Anthropic,
// búsqueda y lectura web.
import type Anthropic from 'npm:@anthropic-ai/sdk@1.8.0'
import type { Hub } from './datos.ts'
import type { Memoria } from './memoria.ts'
import { ETAPAS, type Acciones, type TipoAccion } from './acciones.ts'
import type { Lugares } from './lugares.ts'

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
  herramienta('leer_mision', 'El resultado (o el avance) de una misión de agentes. Sin id, la última.', {
    id: opcional({ type: 'string', description: 'Id de la misión (aparece en el panorama).' }),
  }),
  herramienta(
    'leer_informes',
    'Informes de los agentes: preparador (brief de cada reunión), cobranzas (pendientes con el mensaje redactado), postventa (salud de clientes y oportunidades), monitor (sistemas o demos caídos), propuesta (cotización en borrador armada para un cliente), auditor (diagnóstico de redes y web), meta_ads (propuesta de campaña), financiero (análisis mensual de la plata del estudio) y ventas (aprendizajes de lo ganado y lo perdido). Con id, el informe completo; si no, los últimos (filtrando por agente o cliente).',
    {
      id: opcional({ type: 'string', description: 'Id del informe (aparece en el panorama).' }),
      agente: opcional({ type: 'string', enum: ['preparador', 'cobranzas', 'postventa', 'monitor', 'propuesta', 'auditor', 'meta_ads', 'financiero', 'ventas'] }),
      cliente: opcional({ type: 'string' }),
    },
  ),
]

/** Lanzar una misión: varios agentes trabajando en paralelo en segundo plano (no modifican el hub). */
export const HERRAMIENTA_MISION: Anthropic.Beta.BetaTool = herramienta(
  'lanzar_mision',
  'Lanza una misión: un equipo de 2 a 5 agentes que trabajan en paralelo y en segundo plano sobre un pedido GRANDE de varios pasos (preparar una reunión, investigar un cliente y su competencia, buscar prospectos y armarles un mensaje, armar una estrategia). Tarda uno o dos minutos y el socio ve el avance en pantalla. No la uses para preguntas simples.',
  { pedido: { type: 'string', description: 'El pedido completo y claro, con el cliente y lo que se espera como resultado.' } },
)

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

const cliente = { type: 'string', description: 'Nombre del cliente, empresa o contacto, como figura en el hub.' }
const PREPARA = ' NO se hace sola: queda en pantalla para que el socio la confirme.'

/** Acciones sobre el hub: se preparan y esperan la confirmación del socio. */
export const HERRAMIENTAS_ACCIONES: Anthropic.Beta.BetaTool[] = [
  herramienta('agendar_reunion', `Prepara una reunión nueva en el calendario.${PREPARA}`, {
    cliente: opcional({ ...cliente, description: 'Cliente o prospecto con el que es la reunión (null si es interna).' }),
    titulo: { type: 'string', description: 'Título corto, por ejemplo "Demo del bot".' },
    fecha,
    hora: { type: 'string', description: 'Hora de inicio en formato HH:MM de 24 h (hora de Argentina).' },
    duracion_min: opcional({ type: 'integer', description: 'Duración en minutos (por defecto 60).' }),
    lugar: opcional({ type: 'string', description: 'Lugar o link de la videollamada.' }),
  }),
  herramienta('proxima_accion', `Prepara la próxima acción de un cliente en el pipeline (reemplaza la que tenga).${PREPARA}`, {
    cliente,
    accion: { type: 'string', description: 'Qué hay que hacer, empezando con un verbo ("Mandarle la cotización").' },
    fecha: opcional(fecha),
  }),
  herramienta('mover_etapa', `Prepara el cambio de etapa de un cliente en el pipeline.${PREPARA}`, {
    cliente,
    etapa: { type: 'string', enum: [...ETAPAS] },
    motivo_perdida: opcional({ type: 'string', description: 'Solo si pasa a perdido.' }),
  }),
  herramienta('nota_cliente', `Prepara una nota para la carpeta del cliente (se agrega a sus notas con fecha).${PREPARA}`, {
    cliente,
    nota: { type: 'string', description: 'La nota, corta y autocontenida.' },
  }),
  herramienta('cotizacion_borrador', `Prepara una cotización en borrador con servicios del catálogo (precios del catálogo).${PREPARA}`, {
    cliente,
    titulo: opcional({ type: 'string', description: 'Título de la cotización.' }),
    servicios: {
      type: 'array',
      description: 'Servicios del catálogo (nombre exacto o id). Consultá el catálogo antes si no lo tenés.',
      items: {
        type: 'object',
        properties: { servicio: { type: 'string' }, cantidad: opcional({ type: 'number' }) },
        required: ['servicio', 'cantidad'],
        additionalProperties: false,
      },
    },
  }),
  herramienta('confirmar_accion', 'Ejecuta una acción pendiente. Usala SOLO cuando el socio la confirma explícitamente ("sí", "dale", "confirmá").', {
    id: { type: 'string', description: 'Id de la acción (está en <acciones_pendientes>).' },
  }),
  herramienta('cancelar_accion', 'Cancela una acción pendiente (cuando el socio dice que no o la quiere cambiar).', {
    id: { type: 'string', description: 'Id de la acción.' },
  }),
]

/** Abrir una pantalla del hub (navegar no cambia datos: no hace falta confirmar). */
export const PANTALLAS = [
  'inicio', 'calendario', 'pipeline', 'clientes', 'carpeta_cliente', 'cotizador', 'cotizacion_cliente', 'catalogo',
  'finanzas', 'costos', 'grabaciones', 'ultima_grabacion', 'sistemas', 'demos',
] as const
export const HERRAMIENTA_PANTALLA: Anthropic.Beta.BetaTool = herramienta(
  'mostrar_pantalla',
  'Abre una pantalla del hub para mostrársela al socio ("mostrame…", "abrí…", "llevame a…", "quiero ver…"). En la pantalla de Jarvis se abre como panel; en el resto del hub, navega. carpeta_cliente, cotizacion_cliente (la última) y ultima_grabacion (de un cliente o la última en general) usan "cliente".',
  { pantalla: { type: 'string', enum: [...PANTALLAS] }, cliente: opcional({ type: 'string', description: 'Nombre del cliente, si la pantalla es de un cliente.' }) },
)

/** Mapa de Jarvis: buscar negocios por zona y mover el mapa (no cambian datos del hub). */
const textoNulo = opcional({ type: 'string' })
export const HERRAMIENTAS_MAPA: Anthropic.Beta.BetaTool[] = [
  herramienta(
    'buscar_negocios',
    'Busca negocios de un rubro en una zona (por defecto, Tucumán) en OpenStreetMap, con dirección y contacto, y los marca en el mapa de Jarvis. Para "buscame hamburgueserías en Yerba Buena", "qué gimnasios hay en el centro", "buscá prospectos de…".',
    {
      rubro: { type: 'string', description: 'El rubro como lo dijo el socio, en plural (ej. "hamburgueserías").' },
      zona: { type: 'string', description: 'Barrio y ciudad (ej. "Yerba Buena, Tucumán"). Si no la dijo, "San Miguel de Tucumán".' },
      palabras: {
        type: 'array',
        items: { type: 'string' },
        description: 'De 2 a 6 palabras o raíces para encontrar el rubro en nombres y categorías de OpenStreetMap, en español e inglés (ej. ["hamburgues", "burger"], ["gimnasio", "gym", "fitness"], ["pizzer", "pizza"]).',
      },
    },
  ),
  herramienta(
    'completar_busqueda',
    'Suma o completa lugares de una búsqueda con lo que encontraste en la web (teléfono, Instagram, web, dirección). Los nuevos con dirección se ubican solos en el mapa.',
    {
      busqueda_id: { type: 'string', description: 'El id que devolvió buscar_negocios.' },
      lugares: {
        type: 'array',
        items: {
          type: 'object',
          properties: { nombre: { type: 'string' }, direccion: textoNulo, telefono: textoNulo, instagram: textoNulo, web: textoNulo, nota: textoNulo },
          required: ['nombre', 'direccion', 'telefono', 'instagram', 'web', 'nota'],
          additionalProperties: false,
        },
      },
    },
  ),
  herramienta(
    'mostrar_mapa',
    'Abre el mapa de Jarvis y vuela a un lugar ("mostrame el mapa", "llevame a Yerba Buena", "dónde queda la calle Aconquija 1500"). Sin lugar, abre Tucumán.',
    { lugar: opcional({ type: 'string', description: 'Dirección, barrio o ciudad.' }) },
  ),
]

const TIPOS_ACCION = new Set<string>(['agendar_reunion', 'proxima_accion', 'mover_etapa', 'nota_cliente', 'cotizacion_borrador'])

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
  agendar_reunion: 'calendario',
  proxima_accion: 'pipeline',
  mover_etapa: 'pipeline',
  nota_cliente: 'carpeta del cliente',
  cotizacion_borrador: 'cotizador',
  confirmar_accion: 'acción',
  mostrar_pantalla: 'pantallas',
  lanzar_mision: 'misión',
  leer_mision: 'misión',
  leer_informes: 'informes de los agentes',
  cancelar_accion: 'acción',
  buscar_negocios: 'mapa · OpenStreetMap',
  completar_busqueda: 'mapa',
  mostrar_mapa: 'mapa',
  web_search: 'búsqueda web',
  web_fetch: 'lectura web',
}

type Entrada = Record<string, unknown>
const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

/**
 * Ejecuta una herramienta. Escribe solo en la memoria de Jarvis; las acciones sobre el hub
 * se preparan y se ejecutan recién cuando el socio confirma.
 */
export async function ejecutar(
  hub: Hub,
  memoria: Memoria,
  acciones: Acciones,
  nombre: string,
  e: Entrada,
  mostrar: (destino: { ruta: string; titulo: string }) => void = () => {},
  lanzarMision?: (pedido: string) => Promise<string>,
  lugares?: Lugares,
): Promise<string> {
  if (nombre === 'buscar_negocios' || nombre === 'completar_busqueda' || nombre === 'mostrar_mapa') {
    if (!lugares) throw new Error('Desde acá no se puede usar el mapa.')
    if (nombre === 'mostrar_mapa') return lugares.mostrar(s(e.lugar))
    if (nombre === 'buscar_negocios')
      return lugares.buscar(String(e.rubro ?? ''), String(e.zona ?? ''), Array.isArray(e.palabras) ? e.palabras.map(String) : [])
    return lugares.completar(String(e.busqueda_id ?? ''), Array.isArray(e.lugares) ? (e.lugares as Record<string, string | null>[]).map((l) => ({ ...l, nombre: String(l.nombre ?? '') })) : [])
  }
  if (TIPOS_ACCION.has(nombre)) return acciones.preparar(nombre as TipoAccion, e)
  switch (nombre) {
    case 'lanzar_mision': {
      if (!lanzarMision) throw new Error('Desde acá no se pueden lanzar misiones.')
      const id = await lanzarMision(String(e.pedido ?? ''))
      return `Misión lanzada (id ${id}). Los agentes ya están trabajando en segundo plano y el socio ve el avance en pantalla. Decile en una oración que armaste el equipo y que en uno o dos minutos tiene el resultado.`
    }
    case 'leer_mision':
      return hub.mision(s(e.id))
    case 'leer_informes':
      return hub.informes({ id: s(e.id), agente: s(e.agente), cliente: s(e.cliente) })
    case 'mostrar_pantalla': {
      const destino = await hub.pantalla(String(e.pantalla ?? ''), s(e.cliente))
      mostrar(destino)
      return `Listo: le estoy mostrando "${destino.titulo}" en pantalla. Decile en pocas palabras qué abriste (o lo más importante que se ve), sin repetir todo.`
    }
    case 'confirmar_accion': {
      const r = await acciones.confirmar(String(e.id ?? ''))
      return `${r.estado === 'hecha' ? 'Hecha' : r.estado === 'error' ? 'Falló' : 'No se hizo'}: ${r.resultado ?? r.resumen}`
    }
    case 'cancelar_accion':
      return acciones.cancelar(String(e.id ?? ''))
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
