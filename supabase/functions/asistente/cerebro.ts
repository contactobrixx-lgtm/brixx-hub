// La llamada a Claude: arma los mensajes y devuelve un texto listo para leer en voz alta.
import Anthropic from 'npm:@anthropic-ai/sdk@1.8.0'

export const MODELO = 'claude-sonnet-5-5'

export interface Turno {
  rol: 'usuario' | 'asistente'
  texto: string
}

export const SISTEMA = `Sos el asistente de voz del hub interno de brixx, una agencia de IA y soluciones digitales de dos socios en Argentina. \
Te hablan por voz y tu respuesta se lee en voz alta.

Cómo responder:
- En español rioplatense, con voseo, cálido y directo, como un compañero de trabajo.
- Corto: 3 o 4 oraciones como máximo. Más largo solo si te piden un resumen o un detalle, y aun así breve.
- Texto plano para leer en voz alta: sin markdown, sin asteriscos, sin títulos, sin viñetas ni listas numeradas, sin emojis. \
Si tenés que enumerar, decilo en una oración ("tenés tres cosas: primero…, después…, y por último…").
- Números y fechas como se dicen: "el jueves 13", "cincuenta dólares", "a las tres de la tarde".
- Respondé solo con los datos del hub que te paso. Si algo no está, decilo sin vueltas y sugerí dónde mirarlo en el hub. No inventes.
- "Lo pendiente" incluye: próximas acciones vencidas o de hoy, reuniones próximas, cotizaciones enviadas sin respuesta, \
grabaciones sin procesar y abonos o saldos sin cobrar.
- Si la pregunta no es sobre el hub o el trabajo, respondé breve y amable.`

/** Por las dudas: saca restos de markdown que no se leen bien en voz alta. */
export function limpiarParaVoz(texto: string): string {
  return texto
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_#`>]+/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/^ +/gm, '')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

/** Arma los mensajes: la charla previa como turnos y los datos del hub junto a la pregunta actual. */
export function armarMensajes(contexto: string, pregunta: string, historial: Turno[]): Anthropic.Beta.BetaMessageParam[] {
  const mensajes: Anthropic.Beta.BetaMessageParam[] = historial.map((t) => ({
    role: t.rol === 'usuario' ? 'user' : 'assistant',
    content: t.texto,
  }))
  // La API exige que el primer mensaje sea del usuario
  while (mensajes.length && mensajes[0].role !== 'user') mensajes.shift()
  mensajes.push({ role: 'user', content: `<datos_del_hub>\n${contexto}\n</datos_del_hub>\n\n<pregunta>${pregunta}</pregunta>` })
  return mensajes
}

export async function responder(contexto: string, pregunta: string, historial: Turno[]): Promise<{ respuesta: string; modelo: string }> {
  const client = new Anthropic() // lee ANTHROPIC_API_KEY, igual que "grabaciones"
  const response = await client.beta.messages.create({
    model: MODELO,
    max_tokens: 8000,
    // Si el modelo rechaza el pedido, la API lo reintenta sola con un modelo de respaldo.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low' }, // respuestas rápidas para conversar
    system: SISTEMA,
    messages: armarMensajes(contexto, pregunta, historial),
  })

  if (response.stop_reason === 'refusal') {
    return { respuesta: 'Perdón, esa no la puedo responder. Probá preguntándome de otra forma.', modelo: response.model }
  }
  const texto = response.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .filter(Boolean)
    .join(' ')
  return { respuesta: limpiarParaVoz(texto) || 'No me salió una respuesta. ¿Me lo repetís?', modelo: response.model }
}
