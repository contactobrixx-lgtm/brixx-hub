// Análisis de la transcripción con Claude: resumen, puntos clave, próximos pasos
// y una propuesta de trabajo armada con el catálogo de servicios del estudio.
import Anthropic from 'npm:@anthropic-ai/sdk@1.8.0'
import type { Segmento } from './transcripcion.ts'

export const MODELO = 'claude-opus-5-5'

export const claudeConfigurado = () => Boolean(Deno.env.get('ANTHROPIC_API_KEY'))

export interface ServicioCatalogo {
  id: string
  nombre: string
  descripcion: string | null
  precio_implementacion: number
  precio_mensual: number
}

export type Origen = 'reunion' | 'audio'

export interface ContextoAnalisis {
  /** 'reunion' = grabada con el micrófono; 'audio' = archivo subido (por ejemplo, un audio de WhatsApp) */
  origen: Origen
  titulo: string
  fecha: string // YYYY-MM-DD de la reunión
  segmentos: Segmento[]
  hablantes: Record<string, string>
  servicios: ServicioCatalogo[]
  prospecto: { nombre: string; empresa: string | null; rubro: string | null; etapa: string; notas: string | null } | null
}

const texto = { type: 'string' }
const textoONull = { anyOf: [{ type: 'string' }, { type: 'null' }] }
const lista = (items: unknown) => ({ type: 'array', items })
const objeto = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
})

/** Forma fija de la respuesta. Mantener en sincronía con `Analisis` en src/types/db.ts. */
export const ESQUEMA = objeto({
  resumen: texto,
  puntos_clave: lista(
    objeto({
      titulo: texto,
      detalle: texto,
      tipo: { type: 'string', enum: ['necesidad', 'dolor', 'presupuesto', 'plazo', 'objecion', 'oportunidad', 'decision', 'otro'] },
      cita: texto,
      segundo: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
    }),
  ),
  decisiones: lista(texto),
  proximos_pasos: lista(objeto({ accion: texto, responsable: textoONull, fecha: textoONull })),
  propuesta: objeto({
    enfoque: texto,
    servicios: lista(
      objeto({
        servicio_id: textoONull,
        nombre: texto,
        motivo: texto,
        etapa: { type: 'integer', enum: [1, 2, 3] },
      }),
    ),
    riesgos: lista(texto),
  }),
  preguntas_pendientes: lista(texto),
})

/** Para audios subidos: lo mismo, más qué quiere la persona y una respuesta lista para mandar. */
export const ESQUEMA_AUDIO = {
  ...ESQUEMA,
  properties: { lo_que_quiere: texto, respuesta_sugerida: texto, ...ESQUEMA.properties },
  required: ['lo_que_quiere', 'respuesta_sugerida', ...ESQUEMA.required],
}

const SISTEMA = `Sos el analista comercial de brixx, una agencia de IA y soluciones digitales de dos socios en Argentina. \
Leés la transcripción de una reunión (con un cliente, un prospecto o entre los socios) y dejás lo que hace falta para actuar.

Qué devolver:
- resumen: 3 a 5 oraciones, en español rioplatense, claras y sin relleno.
- puntos_clave: lo más importante de la reunión, de 4 a 10 puntos, ordenados por importancia. En "cita" copiá textual \
una frase breve de la transcripción que lo respalde (exacta, sin corregirla) y en "segundo" el segundo de la grabación \
donde empieza esa frase, tomado de la marca [mm:ss] de su línea. Si un punto no sale de una frase concreta, segundo = null.
- decisiones: lo que quedó acordado. Lista vacía si no se decidió nada.
- proximos_pasos: acciones concretas. "responsable" es el nombre de quien se comprometió (o null) y "fecha" en formato \
AAAA-MM-DD cuando se mencionó un día (resolvé "el viernes", "la semana que viene", etc. respecto de la fecha de la reunión), si no null.
- propuesta: cómo conviene encarar el trabajo para este cliente.
  - enfoque: el plan en 2 a 4 oraciones, pensando en qué le da resultados antes y con menos inversión.
  - servicios: elegí del catálogo que te paso. Usá su "id" exacto en servicio_id. Si hace falta algo que no está en el \
catálogo, servicio_id = null y describilo en "nombre". "etapa": 1 = arrancar ya, 2 = con las primeras ventas, \
3 = cuando haya ingresos estables. No inventes precios: el hub los toma del catálogo.
  - riesgos: lo que puede trabar el proyecto (presupuesto, tiempos, dependencias del cliente).
- preguntas_pendientes: lo que conviene preguntar o confirmar en el próximo contacto.

Reglas: basate solo en lo que se dijo. No inventes datos del cliente, montos ni fechas. Si la reunión no fue comercial \
(por ejemplo, entre los socios), adaptá la propuesta a lo que se habló o dejá servicios vacío.`

const SISTEMA_AUDIO = `Sos el analista comercial de brixx, una agencia de IA y soluciones digitales de dos socios en Argentina. \
Te pasan la transcripción de un audio que alguien le mandó a brixx (casi siempre una nota de voz de WhatsApp de un cliente, \
un prospecto o un proveedor). Tu trabajo es entender qué quiere esa persona y dejar todo listo para contestarle.

Qué devolver:
- lo_que_quiere: en 1 o 2 oraciones, qué pide o qué necesita la persona, directo al grano.
- respuesta_sugerida: un mensaje para mandarle por WhatsApp de parte de brixx. Cálido, profesional, en español rioplatense \
con voseo, de 2 a 5 oraciones, sin emojis ni markdown. Respondé lo que se pueda, y si falta información, preguntala. \
No prometas precios, plazos ni cosas que no estén en el audio o en el catálogo.
- resumen: 2 a 4 oraciones con el contexto del audio.
- puntos_clave: lo importante, de 1 a 6 puntos (pedidos, dudas, datos, fechas, montos), ordenados por importancia. En "cita" \
copiá textual una frase breve de la transcripción y en "segundo" el segundo donde empieza, tomado de la marca [mm:ss]; si no, null.
- decisiones: lo que la persona ya decidió o confirmó. Lista vacía si nada.
- proximos_pasos: lo que tiene que hacer brixx para responder o avanzar. "responsable" null salvo que se nombre a alguien; \
"fecha" AAAA-MM-DD si se mencionó un día (resolvé "el viernes", "mañana", etc. respecto de la fecha del audio), si no null.
- propuesta: si el audio es un pedido de trabajo, cómo encararlo con servicios del catálogo (usá su "id" exacto; \
servicio_id = null si no está; etapa 1 = arrancar ya, 2 = con las primeras ventas, 3 = con ingresos estables; sin inventar precios). \
Si no es un pedido de trabajo (un reclamo, una consulta, algo personal), dejá servicios vacío y en enfoque contá cómo conviene manejarlo.
- preguntas_pendientes: lo que falta saber para avanzar.

Reglas: basate solo en lo que se dijo. No inventes datos, montos ni fechas. Si el audio está cortado o no se entiende, decilo en lo_que_quiere.`

function mmss(ms: number) {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** Arma el mensaje con la transcripción y el contexto (exportada para tests). */
export function armarMensaje(ctx: ContextoAnalisis): string {
  const nombre = (h: string) => ctx.hablantes[h] || `Hablante ${h}`
  const transcripcion = ctx.segmentos.map((s) => `[${mmss(s.inicio_ms)}] ${nombre(s.hablante)}: ${s.texto}`).join('\n')
  const catalogo = ctx.servicios
    .map(
      (s) =>
        `- id: ${s.id} | ${s.nombre}${s.descripcion ? ` — ${s.descripcion}` : ''} | implementación USD ${Number(s.precio_implementacion)} | abono USD ${Number(s.precio_mensual)}/mes`,
    )
    .join('\n')
  const p = ctx.prospecto
  const cliente = p
    ? `${p.empresa ? `${p.empresa} (contacto: ${p.nombre})` : p.nombre}. Rubro: ${p.rubro ?? 'sin dato'}. Etapa en el pipeline: ${p.etapa}.${p.notas ? ` Notas previas: ${p.notas}` : ''}`
    : 'No está vinculada a un cliente o prospecto.'

  const etiqueta = ctx.origen === 'audio' ? 'audio' : 'reunion'
  return `<${etiqueta}>
Título: ${ctx.titulo}
Fecha: ${ctx.fecha}
Cliente o prospecto: ${cliente}
</${etiqueta}>

<catalogo_de_servicios>
${catalogo || '(el catálogo está vacío)'}
</catalogo_de_servicios>

<transcripcion>
${transcripcion}
</transcripcion>`
}

export async function analizar(ctx: ContextoAnalisis): Promise<{ analisis: unknown; modelo: string }> {
  const client = new Anthropic() // lee ANTHROPIC_API_KEY
  const esAudio = ctx.origen === 'audio'
  const response = await client.beta.messages.create({
    model: MODELO,
    max_tokens: 16000,
    // Si el modelo rechaza el pedido, la API lo reintenta sola con un modelo de respaldo.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: esAudio ? ESQUEMA_AUDIO : ESQUEMA } },
    system: esAudio ? SISTEMA_AUDIO : SISTEMA,
    messages: [{ role: 'user', content: armarMensaje(ctx) }],
  })

  if (response.stop_reason === 'refusal') {
    throw new Error(`Claude no pudo analizar ${esAudio ? 'este audio' : 'esta reunión'} (rechazo de seguridad).`)
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error('El análisis quedó incompleto (respuesta demasiado larga).')
  }
  const bloque = response.content.find((b) => b.type === 'text')
  if (!bloque || bloque.type !== 'text') throw new Error('Claude no devolvió texto.')
  return { analisis: JSON.parse(bloque.text), modelo: response.model }
}
