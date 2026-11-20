// Guion del video explicativo: Claude lo arma a partir de lo que sabemos del cliente (su carpeta y la
// intervención o reunión de la que sale el video). Mantener ESQUEMA_GUION en sincronía con `GuionVideo`
// en src/types/db.ts y con el dibujo de cada tipo de escena en src/features/videos/lienzo.ts.
import Anthropic from 'npm:@anthropic-ai/sdk@1.8.0'
import { MODELO } from '../grabaciones/analisis.ts'

const texto = { type: 'string' }
const textoONull = { anyOf: [{ type: 'string' }, { type: 'null' }] }
const lista = (items: unknown) => ({ type: 'array', items })
const objeto = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
})

export const TIPOS_ESCENA = ['apertura', 'chat', 'flujo', 'panel', 'beneficios', 'cierre'] as const

export const ESQUEMA_GUION = objeto({
  titulo: texto,
  cliente: texto,
  etiqueta: texto,
  escenas: lista(
    objeto({
      tipo: { type: 'string', enum: [...TIPOS_ESCENA] },
      narracion: texto,
      titulo: textoONull,
      subtitulo: textoONull,
      contacto: textoONull,
      mensajes: lista(objeto({ de: { type: 'string', enum: ['cliente', 'bot', 'persona', 'aviso'] }, texto })),
      por_dentro: lista(objeto({ titulo: texto, detalle: texto })),
      items: lista(objeto({ titulo: texto, detalle: texto })),
    }),
  ),
})

export type Enfoque = 'cliente' | 'equipo'

const SISTEMA = `Sos guionista de brixx, una agencia de IA y soluciones digitales de Tucumán, Argentina. Armás videos \
explicativos cortos (16:9, de 75 a 95 segundos) que muestran cómo funcionaría la solución que le proponemos a un cliente, \
con una voz en off y escenas animadas. Te paso todo lo que sabemos del cliente y la intervención o reunión de la que sale el video.

Qué devolver:
- titulo: nombre corto del video para el hub ("Bot de turnos para Nena Gestión Humana").
- cliente: el nombre del negocio del cliente tal como lo conocemos (si no hay, una forma genérica: "tu consultorio").
- etiqueta: la solución en 2 a 5 palabras ("Bot de WhatsApp con IA", "Agenda inteligente").
- escenas: de 7 a 11, en este orden:
  1. "apertura": titulo = una pregunta o frase gancho corta (máx. 8 palabras); subtitulo = la solución en una línea.
  2. De 2 a 4 escenas "chat" si la solución atiende personas por WhatsApp o redes: una charla REAL entre un cliente final \
del negocio (contacto = nombre de pila inventado y creíble, ej. "Laura") y el bot del negocio. mensajes de 3 a 6, cortos \
(máx. 120 caracteres), humanos, en español rioplatense con voseo, con algún emoji como mucho. "cliente" escribe el cliente \
final, "bot" contesta el bot (cálido, breve, como alguien del negocio; nunca inventa precios ni datos que no estén en el \
material), "persona" es alguien del equipo del negocio que toma la charla, "aviso" es una línea de sistema corta \
("Turno cargado en la agenda", "Charla derivada a Nena"). Mostrá los casos de uso concretos del material (recordatorios, \
cancelaciones, consultas, pagos, derivar lo delicado a una persona…). Una escena chat puede continuar la charla anterior \
(mismo contacto) o empezar otra. por_dentro: de 3 a 5 pasos de lo que hace el sistema mientras tanto (titulo de 2 a 4 \
palabras + detalle corto: "Revisa la agenda" / "Encuentra el hueco del jueves"). Si la solución no es un bot, usá 1 escena \
"chat" solo si tiene sentido, o ninguna.
  3. "flujo" (cómo funciona): titulo corto; items = de 3 a 5 cosas con las que se conecta o que usa (titulo = nombre \
— "WhatsApp", "Agenda", "Obra social", "Panel" —, detalle de 2 a 6 palabras).
  4. "panel" si la solución incluye un panel, CRM, agenda o reportes: titulo ("Lo que ve Nena"); items = de 3 a 5 filas \
o indicadores que vería (titulo + detalle corto).
  5. "beneficios": titulo ("¿Qué gana Nena?"); items = de 4 a 6 beneficios (titulo de 2 a 4 palabras + detalle de \
4 a 9 palabras) sacados de los objetivos y dolores del cliente.
  6. "cierre": titulo = una frase corta de cierre con el nombre del cliente; subtitulo = "Lo armamos en brixx." o similar.
- En las escenas que no usan un campo, mandalo null o lista vacía.

Narración (campo narracion de cada escena, la lee una voz en off):
- Total entre 1.000 y 1.350 caracteres sumando todas las escenas (≈ 80-90 segundos). Cada escena entre 60 y 220 caracteres.
- Español rioplatense neutro, cálido y claro, oraciones cortas. Sin tecnicismos (no digas "IA generativa", "API", "LLM"), \
sin emojis, sin símbolos, los números en palabras o cifras simples.
- La narración cuenta lo que se ve en la escena (en las chat, lo que pasa en la charla y por qué importa).
- {ENFOQUE}

Reglas: basate en lo que dice el material (dolores, objetivos, soluciones, la forma de trabajar del cliente). No prometas \
cosas que no podríamos hacer ni pongas precios. Si faltan datos (nombres, sistema que usan), resolvelo de forma genérica y \
creíble sin afirmar datos falsos del cliente.`

const ENFOQUES: Record<Enfoque, string> = {
  cliente:
    'Le habla directamente al cliente (al dueño del negocio), en segunda persona con voseo: "así podría funcionar tu consultorio", "vos te ocupás de…".',
  equipo:
    'Está pensado para que el cliente se lo muestre a SUS clientes o socios: habla de "el consultorio", "los pacientes", en tercera persona.',
}

export interface Escena {
  tipo: (typeof TIPOS_ESCENA)[number]
  narracion: string
  titulo: string | null
  subtitulo: string | null
  contacto: string | null
  mensajes: { de: 'cliente' | 'bot' | 'persona' | 'aviso'; texto: string }[]
  por_dentro: { titulo: string; detalle: string }[]
  items: { titulo: string; detalle: string }[]
}
export interface Guion {
  titulo: string
  cliente: string
  etiqueta: string
  escenas: Escena[]
}

export async function armarGuion(material: string, enfoque: Enfoque): Promise<{ guion: Guion; modelo: string }> {
  const client = new Anthropic() // lee ANTHROPIC_API_KEY
  const response = await client.beta.messages.create({
    model: MODELO,
    max_tokens: 12000,
    // Si el modelo rechaza el pedido, la API lo reintenta sola con un modelo de respaldo.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: ESQUEMA_GUION } },
    system: SISTEMA.replace('{ENFOQUE}', ENFOQUES[enfoque]),
    messages: [{ role: 'user', content: material }],
  })
  if (response.stop_reason === 'refusal') throw new Error('Claude no pudo armar el guion (rechazo de seguridad).')
  if (response.stop_reason === 'max_tokens') throw new Error('El guion quedó incompleto.')
  const bloque = response.content.find((b) => b.type === 'text')
  if (!bloque || bloque.type !== 'text') throw new Error('Claude no devolvió el guion.')
  const guion = JSON.parse(bloque.text) as Guion
  guion.escenas = guion.escenas.filter((e) => e.narracion?.trim()).slice(0, 12)
  if (guion.escenas.length < 3) throw new Error('El guion salió demasiado corto.')
  return { guion, modelo: response.model }
}
