// La llamada a Claude: con un panorama de hoy siempre presente y herramientas de solo lectura
// para consultar el resto del hub. Devuelve texto listo para leer en voz alta.
import Anthropic from 'npm:@anthropic-ai/sdk@1.8.0'
import type { Hub } from './datos.ts'
import { ejecutar, HERRAMIENTAS } from './herramientas.ts'

export const MODELO = 'claude-sonnet-5-5'
const MAX_VUELTAS = 6 // pedidos a Claude por pregunta (incluye las consultas a la base)

export interface Turno {
  rol: 'usuario' | 'asistente'
  texto: string
}

export const SISTEMA = `Sos Jarvis, el asistente de voz del hub interno de brixx, una agencia de IA y soluciones digitales de dos socios en Argentina. \
Te hablan por voz y tu respuesta se lee en voz alta.

Datos:
- Siempre tenés el panorama de hoy (reuniones, próximas acciones, vencidos, cotizaciones sin respuesta, clientes activos).
- Para todo lo demás usá las herramientas: agenda, grabaciones de reuniones (buscar y leer), clientes y prospectos, cotizaciones, \
finanzas, metas, catálogo y sistemas/demos. Podés usar varias a la vez. No adivines: si un dato no está en el panorama, consultalo.
- Para "¿qué se sabe de la reunión con X?": buscá la grabación de ese cliente y leela. Pedí la transcripción solo si te preguntan qué se dijo exactamente.
- Solo podés consultar, no modificar nada. Si te piden agendar, cargar o cambiar algo, decí que por ahora solo consultás y en qué sección del hub se hace.

Cómo responder:
- En español rioplatense, con voseo, cálido y directo, como un compañero de trabajo.
- Corto: 3 o 4 oraciones como máximo. Si piden un resumen o el briefing del día, hasta 6 oraciones.
- Texto plano para leer en voz alta: sin markdown, sin asteriscos, sin títulos, sin viñetas ni listas numeradas, sin emojis. \
Si tenés que enumerar, decilo en una oración ("tenés tres cosas: primero…, después…, y por último…").
- Números, fechas y horas como se dicen: "el jueves 13", "cincuenta dólares", "a las tres de la tarde".
- Si algo no está en los datos, decilo sin vueltas. No inventes.
- Para un saludo o el briefing: saludá por el nombre según la hora (buen día, buenas tardes, buenas noches) y contá lo más importante del día.`

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

/** La charla previa como turnos y, al final, el panorama de hoy junto a la pregunta actual. */
export function armarMensajes(panorama: string, pregunta: string, historial: Turno[]): Anthropic.Beta.BetaMessageParam[] {
  const mensajes: Anthropic.Beta.BetaMessageParam[] = historial.map((t) => ({
    role: t.rol === 'usuario' ? 'user' : 'assistant',
    content: t.texto,
  }))
  // La API exige que el primer mensaje sea del usuario
  while (mensajes.length && mensajes[0].role !== 'user') mensajes.shift()
  mensajes.push({ role: 'user', content: `<panorama_de_hoy>\n${panorama}\n</panorama_de_hoy>\n\n<pregunta>${pregunta}</pregunta>` })
  return mensajes
}

export interface Resultado {
  respuesta: string
  /** Versión corta para leer en voz alta (igual a respuesta si ya es corta) */
  respuesta_voz: string
  modelo: string
  consultas: string[] // herramientas usadas, para mostrar en pantalla
}

/** Por encima de esto, la voz premium (ElevenLabs) lee un resumen y la pantalla muestra todo. */
export const MAX_VOZ = 600

/** Corta en la última oración completa que entra en el límite. */
export function recortarOraciones(texto: string, max: number): string {
  if (texto.length <= max) return texto
  const corte = texto.slice(0, max)
  const fin = Math.max(corte.lastIndexOf('. '), corte.lastIndexOf('? '), corte.lastIndexOf('! '))
  return fin > max / 3 ? corte.slice(0, fin + 1) : corte.replace(/\s+\S*$/, '') + '…'
}

/** Si la respuesta es larga, pide un resumen corto para decir en voz alta (ahorra créditos de voz). */
async function versionHablada(client: Anthropic, respuesta: string): Promise<string> {
  if (respuesta.length <= MAX_VOZ) return respuesta
  try {
    const r = await client.beta.messages.create({
      model: MODELO,
      max_tokens: 2000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system:
        'Resumís respuestas de Jarvis, el asistente de voz de brixx, para leerlas en voz alta. ' +
        'Español rioplatense con voseo, texto plano, sin listas ni markdown. ' +
        'Dos o tres oraciones, menos de 400 caracteres, con lo más importante. ' +
        'Si hace falta, terminá con "el detalle completo te lo dejé en pantalla".',
      messages: [{ role: 'user', content: `<respuesta>\n${respuesta}\n</respuesta>` }],
    })
    if (r.stop_reason === 'refusal') return recortarOraciones(respuesta, MAX_VOZ)
    const texto = limpiarParaVoz(r.content.map((b) => (b.type === 'text' ? b.text : '')).join(' '))
    return recortarOraciones(texto || respuesta, MAX_VOZ)
  } catch (e) {
    console.error('Resumen hablado:', e)
    return recortarOraciones(respuesta, MAX_VOZ)
  }
}

export async function responder(hub: Hub, panorama: string, pregunta: string, historial: Turno[]): Promise<Resultado> {
  const client = new Anthropic() // lee ANTHROPIC_API_KEY, igual que "grabaciones"
  const mensajes = armarMensajes(panorama, pregunta, historial)
  const consultas: string[] = []

  for (let vuelta = 1; vuelta <= MAX_VUELTAS; vuelta++) {
    const ultima = vuelta === MAX_VUELTAS
    const response = await client.beta.messages.create({
      model: MODELO,
      max_tokens: 8000,
      // Si el modelo rechaza el pedido, la API lo reintenta sola con un modelo de respaldo.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' }, // respuestas rápidas para conversar
      system: SISTEMA,
      tools: HERRAMIENTAS,
      // En la última vuelta ya no consulta más: responde con lo que tiene
      tool_choice: ultima ? { type: 'none' } : { type: 'auto' },
      messages: mensajes,
    })

    if (response.stop_reason === 'refusal') {
      const respuesta = 'Perdón, esa no la puedo responder. Probá preguntándome de otra forma.'
      return { respuesta, respuesta_voz: respuesta, modelo: response.model, consultas }
    }

    const usos = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
    if (response.stop_reason === 'tool_use' && usos.length && !ultima) {
      // Se devuelve el turno completo tal cual (incluidos los bloques de razonamiento)
      mensajes.push({ role: 'assistant', content: response.content })
      const resultados = await Promise.all(
        usos.map(async (u): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
          consultas.push(u.name)
          try {
            return { type: 'tool_result', tool_use_id: u.id, content: await ejecutar(hub, u.name, u.input as Record<string, unknown>) }
          } catch (e) {
            return { type: 'tool_result', tool_use_id: u.id, content: `Error al consultar: ${e instanceof Error ? e.message : e}`, is_error: true }
          }
        }),
      )
      // Todos los resultados juntos en un solo mensaje
      mensajes.push({ role: 'user', content: resultados })
      continue
    }

    const texto = response.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .filter(Boolean)
      .join(' ')
    const respuesta = limpiarParaVoz(texto) || 'No me salió una respuesta. ¿Me lo repetís?'
    return { respuesta, respuesta_voz: await versionHablada(client, respuesta), modelo: response.model, consultas }
  }
  const respuesta = 'Me enredé buscando los datos. ¿Me lo preguntás de otra forma?'
  return { respuesta, respuesta_voz: respuesta, modelo: MODELO, consultas }
}
