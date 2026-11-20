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

export const TIPOS_ESCENA = ['apertura', 'chat', 'agenda', 'flujo', 'panel', 'beneficios', 'cierre'] as const
const ESTADOS_TURNO = ['confirmado', 'pendiente', 'libre', 'reprogramado', 'bloqueado']

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
      vista: { type: 'string', enum: ['cliente_final', 'equipo'] },
      mensajes: lista(objeto({ de: { type: 'string', enum: ['cliente', 'bot', 'persona', 'aviso'] }, texto })),
      por_dentro: lista(objeto({ titulo: texto, detalle: texto })),
      items: lista(objeto({ titulo: texto, detalle: texto })),
      columnas: lista(objeto({ nombre: texto, turnos: lista(objeto({ hora: texto, paciente: textoONull, estado: { type: 'string', enum: ESTADOS_TURNO } })) })),
      cambios: lista(
        objeto({ columna: texto, hora: texto, estado: { type: 'string', enum: ESTADOS_TURNO }, paciente: textoONull, nota: texto }),
      ),
    }),
  ),
})

export type Enfoque = 'cliente' | 'equipo'

const SISTEMA = `Sos guionista de brixx, una agencia de IA y soluciones digitales de Tucumán, Argentina. Armás videos \
explicativos (16:9, de 90 a 120 segundos) que muestran cómo funcionaría la solución que le proponemos a un cliente, \
con una voz en off y escenas animadas. Te paso todo lo que sabemos del cliente y la intervención o reunión de la que sale el video.

MUY IMPORTANTE: el video tiene que mostrar LOS DOS LADOS. (a) Lo que vive el cliente final del negocio (el paciente, el \
comprador). (b) Cómo se organiza el DUEÑO y su equipo (los profesionales, los vendedores): qué ve en su agenda o panel, \
qué hace él y qué hace el sistema solo, cómo reprograma, bloquea un día, aprueba o atiende lo que le derivan. El dueño \
es quien compra: tiene que entender cómo sería SU día con el sistema.

Qué devolver:
- titulo: nombre corto del video para el hub ("Asistente de turnos para Nexa Gestión Humana").
- cliente: el nombre del negocio del cliente tal como lo conocemos (si no hay, una forma genérica: "tu consultorio").
- etiqueta: la solución en 2 a 5 palabras ("Asistente de turnos con IA", "Agenda inteligente").
- escenas: de 9 a 14, en este orden:
  1. "apertura": titulo = una pregunta o frase gancho corta (máx. 8 palabras); subtitulo = la solución en una línea.
  2. Lado del cliente final: de 2 a 3 escenas "chat" con vista "cliente_final" si la solución atiende personas por \
WhatsApp o redes: una charla REAL entre un cliente final (contacto = nombre de pila inventado y creíble, ej. "Laura") y \
el asistente del negocio. mensajes de 3 a 6, cortos (máx. 120 caracteres), humanos, en español rioplatense con voseo, con \
algún emoji como mucho. "cliente" escribe el que tiene el celular (el cliente final), "bot" contesta el asistente (cálido, \
breve, como alguien del negocio; nunca inventa precios ni datos que no estén en el material), "persona" es alguien del equipo \
del negocio que toma la charla, "aviso" es una línea de sistema corta ("Turno cargado en la agenda", "Charla derivada a \
Nexa"). Mostrá los casos de uso concretos del material. por_dentro: de 3 a 5 pasos de lo que hace el sistema mientras \
tanto (titulo de 2 a 4 palabras + detalle corto).
  3. Lado del dueño y su equipo (OBLIGATORIO, de 3 a 5 escenas):
     - "agenda" (si el negocio trabaja con turnos, reservas, pedidos o entregas programadas): titulo ("La agenda de la \
Dra. Paz", "Los pedidos de hoy"); columnas = de 1 a 3 profesionales o recursos (nombre: "Dra. Paz") con 4 a 6 turnos cada \
una (hora "09:00", paciente = nombre o null si está libre, estado). cambios = de 2 a 4 cosas que pasan en orden y se ven \
en la agenda: un paciente confirma, otro cancela y el hueco lo toma alguien de la lista de espera, el profesional bloquea \
una tarde y el sistema reprograma, etc. Cada cambio: columna y hora del turno que cambia (exactas, de las columnas), su \
nuevo estado y paciente, y nota = el aviso que le llega al dueño ("Martín pasó al martes 17:00"). Podés usar 1 o 2 escenas agenda.
     - "chat" con vista "equipo": el dueño o un profesional le pide algo al asistente por WhatsApp (contacto = su nombre, \
"Dra. Paz"; "cliente" = lo que escribe él, "bot" = el asistente). Ej.: "El jueves tengo un congreso, pasá mis turnos al \
lunes" → el asistente reprograma y avisa a cada paciente. Mostrá que el dueño sigue decidiendo: el sistema hace el trabajo \
repetitivo. por_dentro con lo que hace el sistema.
     - "panel": lo que ve el dueño en su panel: titulo ("Lo que ve Nexa"); items = de 3 a 5 filas o indicadores con datos \
concretos (titulo + detalle corto: "Dra. Paz · 14 turnos" / "12 confirmados · 1 reprogramado").
  4. "flujo" (cómo funciona): titulo corto; items = de 3 a 5 cosas con las que se conecta o que usa (titulo = nombre \
— "WhatsApp", "Agenda", "Obra social", "Panel" —, detalle de 2 a 6 palabras).
  5. "beneficios": titulo ("¿Qué gana Nexa?"); items = de 4 a 6 beneficios (titulo de 2 a 4 palabras + detalle de \
4 a 9 palabras) para el dueño Y para su equipo, sacados de los objetivos y dolores del cliente.
  6. "cierre": titulo = una frase corta de cierre con el nombre del cliente; subtitulo = "Lo armamos en brixx." o similar.
- Si la solución no tiene turnos ni charlas (por ejemplo, un sistema de gestión), reemplazá las escenas chat y agenda por \
escenas "panel" y "chat" con vista "equipo" que muestren el día a día del dueño con el sistema.
- En cada escena, los campos que no usa van null o con lista vacía (vista: "cliente_final" si no es un chat).

Narración (campo narracion de cada escena, la lee una voz en off):
- Total entre 1.350 y 1.850 caracteres sumando todas las escenas (≈ 95-120 segundos). Cada escena entre 60 y 220 caracteres.
- Español rioplatense neutro, cálido y claro, oraciones cortas. Sin tecnicismos (no digas "IA generativa", "API", "LLM"), \
sin emojis, sin símbolos, los números en palabras o cifras simples.
- La narración cuenta lo que se ve en la escena y por qué le importa al dueño. Al pasar al lado del dueño, marcalo \
("Y del lado de Nexa…", "Mientras tanto, la Dra. Paz ve…").
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
  vista: 'cliente_final' | 'equipo'
  mensajes: { de: 'cliente' | 'bot' | 'persona' | 'aviso'; texto: string }[]
  por_dentro: { titulo: string; detalle: string }[]
  items: { titulo: string; detalle: string }[]
  columnas: { nombre: string; turnos: { hora: string; paciente: string | null; estado: string }[] }[]
  cambios: { columna: string; hora: string; estado: string; paciente: string | null; nota: string }[]
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
    max_tokens: 16000,
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
  guion.escenas = guion.escenas.filter((e) => e.narracion?.trim()).slice(0, 15)
  if (guion.escenas.length < 3) throw new Error('El guion salió demasiado corto.')
  return { guion, modelo: response.model }
}
