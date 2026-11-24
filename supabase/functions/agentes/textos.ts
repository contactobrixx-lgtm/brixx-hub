// Textos de la propuesta comercial (el formato de la propuesta de Alcione): con la carpeta del cliente, sus
// intervenciones y los servicios de la cotización, Claude escribe la portada, el punto de partida, las etapas,
// la tarjeta de cada servicio y las condiciones. No toca precios ni servicios: solo los textos.
// Lo usan el botón "Armar los textos con Claude" (formulario y vista de la propuesta) y el agente "propuesta".
import { nombreCliente, pensarJSON, type Contexto, type Fila } from './comun.ts'

const TEXTO = { type: 'string' }
const LISTA = { type: 'array', items: TEXTO }

const ESQUEMA = {
  type: 'object',
  properties: {
    introduccion: TEXTO,
    subtitulo: TEXTO,
    etapas: {
      type: 'array',
      items: {
        type: 'object',
        properties: { titulo: TEXTO, detalle: TEXTO, plazo: TEXTO },
        required: ['titulo', 'detalle', 'plazo'],
        additionalProperties: false,
      },
    },
    punto_texto: TEXTO,
    puntos: {
      type: 'array',
      items: { type: 'object', properties: { titulo: TEXTO, detalle: TEXTO }, required: ['titulo', 'detalle'], additionalProperties: false },
    },
    objetivos: LISTA,
    plan_titulo: TEXTO,
    plan_texto: TEXTO,
    mantenimiento: LISTA,
    mantenimiento_nota: TEXTO,
    aviso_titulo: TEXTO,
    aviso_texto: TEXTO,
    pago: TEXTO,
    cierre: TEXTO,
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: TEXTO, etapa: { type: 'integer' }, resumen: TEXTO, incluye: LISTA, entregable: TEXTO },
        required: ['id', 'etapa', 'resumen', 'incluye', 'entregable'],
        additionalProperties: false,
      },
    },
  },
  required: [
    'introduccion', 'subtitulo', 'etapas', 'punto_texto', 'puntos', 'objetivos', 'plan_titulo', 'plan_texto', 'mantenimiento',
    'mantenimiento_nota', 'aviso_titulo', 'aviso_texto', 'pago', 'cierre', 'items',
  ],
  additionalProperties: false,
}

interface Salida {
  introduccion: string
  subtitulo: string
  etapas: { titulo: string; detalle: string; plazo: string }[]
  punto_texto: string
  puntos: { titulo: string; detalle: string }[]
  objetivos: string[]
  plan_titulo: string
  plan_texto: string
  mantenimiento: string[]
  mantenimiento_nota: string
  aviso_titulo: string
  aviso_texto: string
  pago: string
  cierre: string
  items: { id: string; etapa: number; resumen: string; incluye: string[]; entregable: string }[]
}

/** La propuesta que le mandamos a Alcione: el modelo de estructura, tono y largo (sin sus datos) */
const MODELO_ALCIONE = `{
  "introduccion": "Una propuesta en tres etapas para que Alcione atienda y venda a toda hora, opere su tienda online sin cargar nada a mano y tenga el control de ventas, stock y caja desde el celular, sin sumar personal.",
  "subtitulo": "en automatización y gestión.",
  "etapas": [
    {"titulo": "Asistente con IA en WhatsApp", "plazo": "3 a 4 semanas", "detalle": "Atiende y vende a toda hora, entrenado con sus chats y su catálogo."},
    {"titulo": "Tienda online automática", "plazo": "4 a 5 semanas", "detalle": "Dragonfish, Tienda Negocio y Dispac conectados: nada se carga a mano. Opcional: tienda propia con diseño."},
    {"titulo": "Sistema de gestión integral", "plazo": "6 a 8 semanas", "detalle": "Ventas, caja, stock y conciliaciones en el celular, con las dos primeras etapas andando."}
  ],
  "punto_texto": "Alcione vende en el local, en Instagram, en WhatsApp y en su tienda de Tienda Negocio. El negocio crece, pero buena parte del trabajo sigue siendo manual y depende del tiempo de los socios.",
  "puntos": [
    {"titulo": "Consultas sin responder", "detalle": "Mensajes de Instagram y WhatsApp que llegan fuera de horario o se acumulan, y ventas que se pierden."},
    {"titulo": "Carga manual de productos", "detalle": "Productos y stock se pasan a mano de Dragonfish a la tienda, y los pedidos a Dispac."},
    {"titulo": "Caja y reportes en Excel", "detalle": "Ventas, medios de pago, conciliaciones y la liquidación de la recaudadora se arman a mano."},
    {"titulo": "Poco control desde el celular", "detalle": "Para saber cómo va el negocio hay que estar en el local o frente a la compu."}
  ],
  "objetivos": ["Que ninguna consulta quede sin respuesta.", "Operar la tienda online sin sumar personal.", "Sacarles a los socios la carga, la caja y los reportes.", "Tener ventas, stock y caja en el celular."],
  "plan_titulo": "Arrancamos por lo que más rápido se nota en las ventas",
  "plan_texto": "Cada etapa funciona por sí sola y suma sobre la anterior. Te proponemos arrancar solo con la etapa 1: en pocas semanas ves los resultados en las ventas y, con el asistente andando, seguimos con la tienda y la gestión.",
  "mantenimiento": ["Soporte y mejoras del asistente.", "Ajustes de las automatizaciones.", "Seguimiento mensual de resultados."],
  "mantenimiento_nota": "El abono de cada etapa empieza recién cuando está funcionando: en la etapa 1 son USD 100/mes. Sin permanencia mínima.",
  "aviso_titulo": "Costos de terceros, a cargo de Alcione",
  "aviso_texto": "Los mensajes que cobra Meta por WhatsApp y el consumo de la IA (unos USD 20 a 60 por mes, según el volumen) y las plataformas que ya usan (Tienda Negocio, Dispac, Dragonfish) se pagan directamente a cada proveedor. Antes de arrancar les pasamos una estimación.",
  "pago": "50% al aprobar cada etapa y 50% a la entrega. Cada etapa se aprueba y se paga por separado.",
  "cierre": "Empecemos por el asistente: USD 840 + USD 100/mes.",
  "items": [
    {"etapa": 1, "resumen": "Un asistente que atiende y vende a toda hora.", "incluye": ["Entrenado con los chats y el catálogo de Alcione.", "Consulta el stock y manda el link del producto.", "Sugiere combinaciones y avisa del envío gratis.", "Deriva al equipo los pedidos especiales."], "entregable": "asistente activo en el WhatsApp de Alcione."},
    {"etapa": 2, "resumen": "La tienda online se actualiza sola.", "incluye": ["Productos, precios y stock de Dragonfish a Tienda Negocio.", "Pedidos de la tienda enviados solos a Dispac.", "Avisos de stock bajo y de pedidos nuevos.", "Nada se carga a mano."], "entregable": "tienda y envíos conectados a Dragonfish."},
    {"etapa": 3, "resumen": "Todo el negocio en el celular.", "incluye": ["Ventas del local, la tienda y WhatsApp en un panel.", "Medios de pago, caja y conciliaciones.", "Stock crítico y liquidación de la recaudadora.", "Conectado a Dragonfish, sin Excel manuales."], "entregable": "panel de gestión en el celular de los socios."}
  ]
}`

const SISTEMA = `Escribís los textos de una propuesta comercial de brixx para un cliente. La propuesta se imprime en hojas A4 con un diseño fijo \
(portada, video, "Dónde está {cliente} hoy", "Qué incluye cada etapa" con una tarjeta por servicio, resumen de la inversión y condiciones).

Seguí EXACTAMENTE el modelo de la propuesta de Alcione (abajo): misma estructura, mismo tono (cálido, concreto, voseo rioplatense, \
le habla al dueño), mismo detalle y mismo largo de cada campo. NO copies sus datos: todo tiene que salir de lo que se sabe de ESTE cliente. \
Si algo no se sabe, escribilo en general sin inventar nombres de sistemas, cifras ni datos del cliente.

Reglas:
- introduccion: 1 oración larga con lo que va a lograr el cliente (no la lista de servicios). subtitulo: la segunda línea gris de la portada, \
corta, en minúscula y con punto ("en automatización y gestión.").
- etapas: agrupá los servicios en etapas que tengan sentido (1 a 4; si hay un solo servicio, una sola etapa). Cada una con titulo corto, \
detalle de una oración y plazo realista ("3 a 4 semanas"). El orden: primero lo que más rápido se nota.
- items: UNA entrada por cada servicio de la cotización, con su id exacto, la etapa (número desde 1) a la que pertenece, resumen (una oración), \
incluye (3 o 4 puntos concretos para ESTE cliente) y entregable (en minúscula, sin punto inicial, con punto final).
- punto_texto (2 oraciones), puntos (exactamente 4 dolores concretos del cliente, título corto + detalle de una oración) y objetivos (exactamente 4).
- plan_titulo y plan_texto: por qué arrancamos por la primera etapa.
- mantenimiento: 3 cosas que cubre el abono. mantenimiento_nota: cuándo empieza el abono (con el monto real de la primera etapa si tiene) y "Sin permanencia mínima."
- aviso: costos de terceros que paga el cliente directo al proveedor (mensajes de WhatsApp de Meta, consumo de IA, plataformas que ya usa) si aplica.
- pago: "50% al aprobar cada etapa y 50% a la entrega." (si hay varias etapas, agregá que cada una se aprueba y paga por separado).
- cierre: una frase corta para arrancar por la primera etapa, con su inversión real (implementación + abono) tal cual figura abajo.
- Montos: solo los que figuran en la cotización, nunca otros. Texto plano, sin asteriscos ni emojis.

<modelo_alcione>
${MODELO_ALCIONE}
</modelo_alcione>`

const plata = (moneda: string, n: number) => `${moneda} ${Math.round(n).toLocaleString('es-AR')}`

/** Escribe los textos de la propuesta de una cotización y los guarda (no toca precios ni servicios). */
export async function armarTextosPropuesta(ctx: Contexto, cotizacionId: string): Promise<void> {
  const { data: c, error } = await ctx.db
    .from('cotizaciones')
    .select('*, cotizacion_items(*), prospectos(*)')
    .eq('id', cotizacionId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!c) throw new Error('No encontré esa cotización.')
  const items = ((c.cotizacion_items ?? []) as Fila[]).sort((a, b) => Number(a.orden) - Number(b.orden))
  if (!items.length) throw new Error('La cotización no tiene servicios: agregale al menos uno.')
  const p = c.prospectos as Fila | null
  const cliente = nombreCliente(p)
  const moneda = String(c.moneda ?? 'USD')

  const [carpeta, grabaciones] = p
    ? await Promise.all([ctx.hub.clientes({ texto: cliente, tipo: 'todos' }), ctx.hub.buscarGrabaciones({ cliente, limite: 6 })])
    : ['', '']

  const r = await pensarJSON<Salida>(ctx, {
    esquema: ESQUEMA,
    timeoutMs: 110_000,
    maxTokens: 8000,
    sistema: SISTEMA,
    pedido: `<cliente>${cliente}${p?.rubro ? ` · ${p.rubro}` : ''}</cliente>
<cotizacion titulo="${String(c.titulo ?? '')}" moneda="${moneda}" descuento="${Number(c.descuento_pct) || 0}%">
${items
  .map(
    (it) =>
      `- id ${it.id} · ${it.descripcion}${it.opcional ? ' (OPCIONAL, no suma al total)' : ''} · implementación ${plata(moneda, Number(it.cantidad) * Number(it.precio_implementacion))}${Number(it.precio_mensual) ? ` + ${plata(moneda, Number(it.cantidad) * Number(it.precio_mensual))}/mes` : ''}${it.etapa ? ` · hoy en la etapa ${it.etapa}` : ''}`,
  )
  .join('\n')}
${c.notas ? `Notas de la cotización: ${c.notas}` : ''}
</cotizacion>
<carpeta>\n${carpeta}\n</carpeta>
<intervenciones_y_reuniones>\n${grabaciones}\n</intervenciones_y_reuniones>`,
  })

  const etapas = r.etapas.filter((e) => e.titulo.trim()).slice(0, 4)
  const previa = (c.propuesta ?? {}) as Fila
  const propuesta: Fila = {
    ...previa,
    subtitulo: r.subtitulo,
    punto_texto: r.punto_texto,
    puntos: r.puntos.slice(0, 4),
    objetivos: r.objetivos.slice(0, 4),
    plan_titulo: r.plan_titulo,
    plan_texto: r.plan_texto,
    mantenimiento: r.mantenimiento.slice(0, 4),
    mantenimiento_nota: r.mantenimiento_nota,
    pago: r.pago,
    cierre: r.cierre,
    moneda_texto: previa.moneda_texto ?? (moneda === 'USD' ? 'Valores en USD, se pueden abonar en pesos al cambio del día de pago.' : 'Valores en pesos argentinos.'),
    telefono: previa.telefono ?? '+54 9 381 582-3919',
  }
  if (r.aviso_titulo.trim() && r.aviso_texto.trim()) propuesta.aviso = { titulo: r.aviso_titulo, texto: r.aviso_texto }
  else delete propuesta.aviso

  const up = await ctx.db.from('cotizaciones').update({ introduccion: r.introduccion, etapas, propuesta }).eq('id', cotizacionId)
  if (up.error) throw new Error(up.error.message)

  const porId = new Map(r.items.map((x) => [x.id, x]))
  await Promise.all(
    items.map(async (it) => {
      const x = porId.get(String(it.id))
      if (!x) return
      const etapa = x.etapa >= 1 && x.etapa <= etapas.length ? x.etapa : null
      const { error } = await ctx.db
        .from('cotizacion_items')
        .update({ etapa, resumen: x.resumen || null, incluye: x.incluye.slice(0, 5), entregable: x.entregable || null })
        .eq('id', it.id)
      if (error) throw new Error(error.message)
    }),
  )
}
