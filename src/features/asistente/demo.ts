// Guion del modo demo de Jarvis ("Jarvis, modo demo"): un recorrido por el hub para mostrarlo y aprender a usarlo.
// Lo que dice es INVENTADO (no consulta la base ni a Claude): sirve para presentarlo sin depender de los datos del día.
// Las pantallas que abre sí son las reales del hub. Cada texto queda por debajo de 600 caracteres (tope de la voz).
import type { DestinoPantalla } from './PanelPantalla'
import type { MetricaTele } from './HudTele'
import type { AgenteMision } from './useMisiones'

export interface PasoDemo {
  titulo: string
  decir: string
  pantalla?: DestinoPantalla
  /** Muestra una misión inventada con agentes trabajando en la red */
  mision?: boolean
}

const saludoDelMomento = (h: number) => (h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches')

export function pasosDemo(ahora = new Date()): PasoDemo[] {
  return [
    {
      titulo: 'Bienvenida',
      decir: `${saludoDelMomento(ahora.getHours())}, señor. Hoy tenemos tres reuniones agendadas para la tarde, dos propuestas esperando respuesta y vamos por el setenta por ciento de la meta del mes. Te hago un recorrido rápido por el hub para que aprendas a usar todo. Si querés cortar, decí: Jarvis, pará.`,
    },
    {
      titulo: 'Inicio',
      pantalla: { ruta: '/inicio', titulo: 'Inicio' },
      decir:
        'Esto es el inicio: lo que cobramos, los costos, el margen y el ingreso recurrente, todo en dólares. Arriba están las metas del mes y del trimestre: te digo si vamos a ritmo y cuántas reuniones y propuestas faltan para llegar.',
    },
    {
      titulo: 'Calendario',
      pantalla: { ruta: '/calendario', titulo: 'Calendario' },
      decir:
        'En el calendario están las reuniones y las próximas acciones de cada cliente. No hace falta cargarlas a mano: decime "Jarvis, agendame una reunión con Nova el jueves a las tres" y te la dejo lista para confirmar con un toque.',
    },
    {
      titulo: 'Pipeline',
      pantalla: { ruta: '/pipeline', titulo: 'Pipeline' },
      decir:
        'El pipeline es el tablero de prospectos: contacto, reunión, demo, propuesta y cierre. Las tarjetas se arrastran entre columnas, o me pedís "pasá a Nova a propuesta". Cuando cargás la demo web de un cliente, pasa solo a la etapa demo.',
    },
    {
      titulo: 'Clientes',
      pantalla: { ruta: '/clientes', titulo: 'Clientes' },
      decir:
        'Cada cliente tiene su carpeta: datos, Instagram, web, objetivos y lo que le proponemos. Después de hablar con alguien, subís el audio de WhatsApp, pegás el chat o sus links, y yo saco los dolores, los cuellos de botella y una propuesta lista para mandar. Si el cliente no existe, le creo la carpeta.',
    },
    {
      titulo: 'Misión de agentes',
      mision: true,
      decir:
        'Además, esta mañana lancé una misión con tres agentes trabajando en paralelo. Analizamos el mercado y entendimos a la competencia del cliente: hay doce estudios en la zona y ninguno responde por WhatsApp fuera de horario. Ahí está nuestra oportunidad, y la propuesta ya quedó armada. Esto lo pedís con: Jarvis, prepará todo para la reunión con tal cliente.',
    },
    {
      titulo: 'Grabaciones',
      pantalla: { ruta: '/grabaciones', titulo: 'Grabaciones' },
      decir:
        'En grabaciones quedan las reuniones que grabás con el celular. Las transcribo y te dejo los puntos clave, los próximos pasos y una propuesta con nuestros servicios. Después me podés preguntar qué se habló en cualquiera.',
    },
    {
      titulo: 'Cotizador',
      pantalla: { ruta: '/cotizador', titulo: 'Cotizador' },
      decir:
        'En el cotizador está el catálogo de servicios, con precio de implementación y abono mensual. Armás la cotización de un cliente en un minuto y la bajás en PDF. Cuando la marcás como aceptada, el cliente pasa a cerrado solo.',
    },
    {
      titulo: 'Finanzas',
      pantalla: { ruta: '/finanzas', titulo: 'Finanzas' },
      decir:
        'En finanzas se cargan los cobros, los costos del estudio y el tipo de cambio. Si un cliente en mantenimiento no pagó el abono del mes, te lo marco como pendiente y lo cargás con un toque.',
    },
    {
      titulo: 'Sistemas y demos',
      pantalla: { ruta: '/sistemas', titulo: 'Sistemas' },
      decir: 'Y acá están los sistemas que entregamos y, en la sección de al lado, las demos web, para abrirlos en un toque cuando estás con un cliente.',
    },
    {
      titulo: 'Cómo hablarme',
      decir:
        'Eso es todo. Para hablarme, tocá el núcleo, o prendé manos libres y decí "Jarvis" antes de la pregunta. Probá con: Jarvis, buen día, qué hay para hoy. O: analizá las redes de tal cliente. O: recordá que Juan prefiere reuniones a la mañana. Y si me pedís "mostrame la carpeta de Nova", te la abro acá mismo.',
    },
  ]
}

/** Números inventados para el modo tele durante el demo */
export const METRICAS_DEMO: MetricaTele[] = [
  { label: 'Cobrado', valor: 'US$ 8.450' },
  { label: 'Clientes nuevos', valor: '3 / 4' },
  { label: 'Recurrente', valor: 'US$ 2.180' },
  { label: 'Por cobrar', valor: 'US$ 3.600' },
]

export const ESTADO_DEMO = { reuniones: 3, acciones: 4, pendientes: 2, pipeline: 11, memoria: 7 }

/** Los agentes inventados de la misión del demo: cada uno con su velocidad y lo que va haciendo */
const AGENTES_DEMO = [
  {
    nombre: 'Investigador de mercado',
    rol: 'Investiga el rubro en la web',
    velocidad: 7,
    pasos: ['Buscando estudios de la zona…', 'Encontré 12 competidores', 'Revisando sus webs e Instagram', 'Listo: mapa del mercado'],
  },
  {
    nombre: 'Analista de competencia',
    rol: 'Compara precios y atención',
    velocidad: 5.5,
    pasos: ['Comparando precios publicados…', 'Midiendo tiempos de respuesta', 'Ninguno contesta WhatsApp de noche', 'Listo: la oportunidad está en la atención'],
  },
  {
    nombre: 'Redactor de propuesta',
    rol: 'Arma la propuesta con el catálogo',
    velocidad: 4.5,
    pasos: ['Esperando el análisis…', 'Eligiendo servicios del catálogo', 'Redactando el mensaje', 'Listo: propuesta armada'],
  },
]

/** Estado de los agentes inventados a los `segundos` de empezada la misión del demo */
export function agentesDemo(segundos: number, inicio: number): AgenteMision[] {
  return AGENTES_DEMO.map((a, i) => {
    const progreso = Math.min(100, Math.round(segundos * a.velocidad))
    const hechos = Math.min(a.pasos.length, 1 + Math.floor((progreso / 100) * (a.pasos.length - 1)))
    return {
      id: `demo-${i}`,
      mision_id: 'demo',
      orden: i,
      nombre: a.nombre,
      rol: a.rol,
      tarea: a.rol,
      usa_web: i === 0,
      estado: progreso >= 100 ? 'listo' : 'trabajando',
      progreso,
      registro: a.pasos.slice(0, hechos).map((texto, j) => ({ t: new Date(inicio + (j * 4 + i) * 1000).toISOString(), texto })),
      resultado: null,
    }
  })
}

/** "Jarvis, modo demo", "hacé una demostración", "mostrame un recorrido"… */
export const pideDemo = (texto: string) => /\bmodo demo\b|\bdemostraci[oó]n\b|\brecorrido\b|\btour\b/i.test(texto)
