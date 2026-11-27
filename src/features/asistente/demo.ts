// Guiones del modo demo de Jarvis. Dos versiones:
// - "tutorial" ("Jarvis, modo demo"): recorre el hub explicando qué hace cada pantalla y qué pedirle.
// - "actuada" ("Jarvis, modo show"): Jarvis actúa el sistema funcionando a full: cuenta lo que hizo, lo que hay
//   para hoy y lo que preparó, abriendo cada pantalla como prueba.
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
  /** Demo en acción: panel con lo que va contando (datos inventados, coinciden con lo que dice) */
  escena?: EscenaDemo
}

export interface EscenaDemo {
  titulo: string
  filas: { etiqueta: string; texto: string; detalle?: string }[]
}

export type TipoDemo = 'tutorial' | 'actuada'

const saludoDelMomento = (h: number) => (h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches')

export function pasosDemo(tipo: TipoDemo = 'tutorial', ahora = new Date()): PasoDemo[] {
  return tipo === 'actuada' ? pasosActuada(ahora) : pasosTutorial(ahora)
}

/** Versión actuada: el sistema funcionando a full, contado como un parte del día (todo inventado) */
function pasosActuada(ahora: Date): PasoDemo[] {
  return [
    {
      titulo: 'Parte del día',
      escena: {
        titulo: 'Desde anoche',
        filas: [
          { etiqueta: '4', texto: 'Conversaciones analizadas', detalle: 'Audios de WhatsApp, chats y un mail' },
          { etiqueta: '1', texto: 'Mercado investigado', detalle: 'Grupo Delta y su competencia' },
          { etiqueta: '1', texto: 'Propuesta lista', detalle: 'Esperando tu visto bueno' },
          { etiqueta: '3', texto: 'Reuniones preparadas', detalle: 'Para hoy' },
        ],
      },
      decir: `${saludoDelMomento(ahora.getHours())}, señor. Desde anoche estuve trabajando: analicé cuatro conversaciones con clientes, investigué un mercado completo y dejé lista una propuesta. Hoy viene un día movido. Te cuento.`,
    },
    {
      titulo: 'Reuniones de hoy',
      escena: {
        titulo: 'Agenda de hoy',
        filas: [
          { etiqueta: '11:00', texto: 'Demo · Panadería Lumière', detalle: 'Bot de WhatsApp con IA · carpeta al día' },
          { etiqueta: '15:00', texto: 'Llamada · Estudio Ferrari', detalle: 'Stock y facturación en un solo lugar' },
          { etiqueta: '17:30', texto: 'Propuesta · Grupo Delta', detalle: 'Propuesta lista para presentar' },
        ],
      },
      decir:
        'Para hoy tenés tres reuniones: a las once, la demo con Panadería Lumière; a las tres, la llamada con Estudio Ferrari; y a las cinco y media, la presentación de la propuesta a Grupo Delta. Las tres ya tienen su carpeta al día.',
    },
    {
      titulo: 'Conversaciones analizadas',
      escena: {
        titulo: 'Conversaciones analizadas',
        filas: [
          { etiqueta: 'Audio', texto: 'Panadería Lumière', detalle: 'Pierde pedidos: contesta WhatsApp a mano → bot con IA' },
          { etiqueta: 'Chat', texto: 'Estudio Ferrari', detalle: 'Planillas y stock desordenado → sistema de gestión' },
          { etiqueta: 'Audio', texto: 'Grupo Delta', detalle: 'Quiere turnos online → agenda con recordatorios' },
          { etiqueta: 'Mail', texto: 'Café Nómade', detalle: 'Pide presupuesto de landing → cotizar esta semana' },
        ],
      },
      decir:
        'Analicé los audios y chats de ayer. Panadería Lumière pierde pedidos porque contesta WhatsApp a mano: ahí entra el bot con inteligencia artificial. Estudio Ferrari quiere dejar las planillas y controlar el stock en un solo lugar. Ya lo anoté en cada carpeta, con lo que conviene ofrecerles.',
    },
    {
      titulo: 'Misión: mercado y competencia',
      mision: true,
      decir:
        'Esta madrugada lancé una misión con tres agentes en paralelo. Analizamos el mercado de Grupo Delta y entendimos a su competencia: de doce empresas del rubro, solo dos tienen turnos online y ninguna responde fuera de horario. Esa es nuestra ventaja para la reunión de las cinco y media.',
    },
    {
      titulo: 'Propuesta lista',
      escena: {
        titulo: 'Propuesta · Grupo Delta (borrador)',
        filas: [
          { etiqueta: 'US$ 1.800', texto: 'Sistema de gestión', detalle: '+ US$ 80 por mes' },
          { etiqueta: 'US$ 600', texto: 'Bot de WhatsApp con IA', detalle: '+ US$ 40 por mes' },
          { etiqueta: 'Total', texto: 'US$ 2.400 + US$ 120 por mes', detalle: 'Esperando tu visto bueno' },
        ],
      },
      decir:
        'Con eso armé la propuesta para Delta: sistema de gestión más bot de WhatsApp, dos mil cuatrocientos dólares de implementación y ciento veinte por mes. Quedó en borrador en el cotizador, esperando tu visto bueno.',
    },
    {
      titulo: 'Pipeline',
      escena: {
        titulo: 'Movimientos del pipeline',
        filas: [
          { etiqueta: 'Demo', texto: 'Panadería Lumière', detalle: 'Pasó de reunión a demo' },
          { etiqueta: 'Propuesta', texto: 'Estudio Ferrari', detalle: 'Pasó de demo a propuesta' },
          { etiqueta: '11', texto: 'Oportunidades abiertas', detalle: 'Unos US$ 18.000 · 3 para cerrar este mes' },
        ],
      },
      decir:
        'En el pipeline pasé a Lumière a demo y a Ferrari a propuesta. Hay once oportunidades abiertas por unos dieciocho mil dólares, y tres se pueden cerrar este mes.',
    },
    {
      titulo: 'Finanzas',
      escena: {
        titulo: 'Finanzas del mes',
        filas: [
          { etiqueta: 'Cobrado', texto: 'US$ 8.450', detalle: 'En lo que va del mes' },
          { etiqueta: 'Recurrente', texto: 'US$ 2.180 por mes', detalle: 'Abonos de clientes activos' },
          { etiqueta: 'Reclamar', texto: 'Grupo Norte', detalle: 'Abono de noviembre sin pagar' },
        ],
      },
      decir:
        'En plata: este mes cobramos ocho mil cuatrocientos cincuenta dólares y el ingreso recurrente está en dos mil ciento ochenta. Grupo Norte todavía no pagó el abono de noviembre: te sugiero recordárselo hoy.',
    },
    {
      titulo: 'Meta del mes',
      escena: {
        titulo: 'Meta del mes',
        filas: [
          { etiqueta: '3 / 4', texto: 'Clientes nuevos', detalle: 'Falta uno para la meta' },
          { etiqueta: '17:30', texto: 'Si cerramos Grupo Delta', detalle: 'Meta cumplida 9 días antes del cierre' },
        ],
      },
      decir: 'Vamos tres de cuatro clientes nuevos en la meta del mes. Si cerramos Delta esta tarde, la cumplimos con nueve días de anticipación.',
    },
    {
      titulo: 'Resumen',
      escena: {
        titulo: 'Para hoy',
        filas: [
          { etiqueta: '3', texto: 'Reuniones preparadas' },
          { etiqueta: '1', texto: 'Propuesta para aprobar', detalle: 'Grupo Delta' },
          { etiqueta: '1', texto: 'Cobro para reclamar', detalle: 'Grupo Norte' },
        ],
      },
      decir:
        'En resumen: tres reuniones preparadas, una propuesta lista para aprobar y un cobro para reclamar. Cuando quieras, arrancamos. Estoy a una palabra de distancia.',
    },
  ]
}

/** Versión tutorial: recorre el hub explicando cada pantalla */
function pasosTutorial(ahora: Date): PasoDemo[] {
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
      titulo: 'Propuestas',
      pantalla: { ruta: '/propuestas', titulo: 'Propuestas' },
      decir:
        'En propuestas está el catálogo de servicios, con precio de implementación y abono mensual. Armás la propuesta de un cliente en un minuto, le mandás el link o la bajás en PDF, y queda también en su carpeta. Cuando la marcás como aceptada, el cliente pasa solo a demo.',
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

/**
 * Qué demo pide, si pide una: "Jarvis, modo show", "demo actuada", "simulá un día" → actuada;
 * "Jarvis, modo demo", "hacé una demostración", "mostrame un recorrido" → tutorial.
 */
export function pideDemo(texto: string): TipoDemo | null {
  if (/\bmodo (show|en acci[oó]n|actuad[oa])\b|\bdemo (actuada|en acci[oó]n)\b|\bsimul[aá] (un|el) d[ií]a\b/i.test(texto)) return 'actuada'
  if (/\bmodo demo\b|\bdemostraci[oó]n\b|\brecorrido\b|\btour\b/i.test(texto)) return 'tutorial'
  return null
}
