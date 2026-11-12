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

export interface ContextoAnalisis {
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

  return `<reunion>
Título: ${ctx.titulo}
Fecha: ${ctx.fecha}
Cliente o prospecto: ${cliente}
</reunion>

<catalogo_de_servicios>
${catalogo || '(el catálogo está vacío)'}
</catalogo_de_servicios>

<transcripcion>
${transcripcion}
</transcripcion>`
}

export async function analizar(ctx: ContextoAnalisis): Promise<{ analisis: unknown; modelo: string }> {
  const client = new Anthropic() // lee ANTHROPIC_API_KEY
  const response = await client.beta.messages.create({
    model: MODELO,
    max_tokens: 16000,
    // Si el modelo rechaza el pedido, la API lo reintenta sola con un modelo de respaldo.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: ESQUEMA } },
    system: SISTEMA,
    messages: [{ role: 'user', content: armarMensaje(ctx) }],
  })

  if (response.stop_reason === 'refusal') {
    throw new Error('Claude no pudo analizar esta reunión (rechazo de seguridad).')
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error('El análisis quedó incompleto (respuesta demasiado larga).')
  }
  const bloque = response.content.find((b) => b.type === 'text')
  if (!bloque || bloque.type !== 'text') throw new Error('Claude no devolvió texto.')
  return { analisis: JSON.parse(bloque.text), modelo: response.model }
}
