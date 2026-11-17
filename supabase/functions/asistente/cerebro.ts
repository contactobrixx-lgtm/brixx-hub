// La llamada a Claude: con el panorama de hoy y la memoria siempre presentes, herramientas de solo
// lectura sobre el hub, la memoria de Jarvis (lo único que escribe) y búsqueda/lectura web.
// La respuesta sale en vivo (para que en pantalla y en voz empiece antes) y en texto listo para leer.
import Anthropic from 'npm:@anthropic-ai/sdk@1.8.0'
import type { Hub } from './datos.ts'
import type { Memoria } from './memoria.ts'
import { ejecutar, HERRAMIENTAS, HERRAMIENTAS_MEMORIA, HERRAMIENTAS_WEB, NOMBRE_CONSULTA } from './herramientas.ts'

export const MODELO = 'claude-sonnet-5-5'
const MAX_VUELTAS = 8 // pedidos a Claude por pregunta (incluye consultas a la base y pausas de la búsqueda web)

export interface Turno {
  rol: 'usuario' | 'asistente'
  texto: string
}

export const SISTEMA = `Sos Jarvis, el asistente de voz del hub interno de brixx, una agencia de IA y soluciones digitales de dos socios en Argentina. \
Te hablan por voz y tu respuesta se lee en voz alta y se muestra en pantalla.

Datos:
- Siempre tenés el panorama de hoy (reuniones, próximas acciones, vencidos, cotizaciones sin respuesta, clientes activos) y tu memoria.
- Para todo lo demás del hub usá las herramientas: agenda, grabaciones e intervenciones (buscar y leer), clientes y prospectos \
(con su carpeta: objetivos y soluciones), cotizaciones, finanzas, metas, catálogo y sistemas/demos. Podés usar varias a la vez. \
No adivines: si un dato no está en el panorama, consultalo.
- Para "¿qué se sabe de X?": buscá sus grabaciones e intervenciones y leelas. Pedí la transcripción solo si te preguntan qué se dijo exactamente.
- Para analizar redes sociales, webs o competidores (por ejemplo "analizá el Instagram de tal y tal y decime qué le conviene a tal cliente"): \
usá web_search y web_fetch, y cruzalo con la carpeta del cliente y el catálogo. Instagram y otras redes suelen no dejarse leer directo: \
si no podés ver un perfil, buscalo en la web y decí con qué información contás.
- Memoria: cuando te dicen "recordá…", "acordate…" o "anotá…", o aparece un dato duradero (una preferencia, un acuerdo con un cliente, \
una decisión del estudio), guardalo con recordar, corto y autocontenido. Si te piden olvidar algo, usá olvidar. No guardes lo que ya está en el hub.
- Lo único que podés modificar es tu memoria. Si te piden agendar, cargar o cambiar algo del hub, decí que por ahora solo consultás y en qué sección se hace.

Cómo responder:
- En español rioplatense, con voseo, cálido y directo, como un compañero de trabajo.
- Empezá SIEMPRE por la respuesta o la conclusión, en la primera oración. Después, el detalle.
- Corto: 2 a 4 oraciones. Para el briefing del día, hasta 6. Para un análisis (redes, competencia, qué le conviene a un cliente), \
hasta 10 oraciones: la voz lee el principio y en pantalla queda todo.
- Texto plano: sin markdown, sin asteriscos, sin títulos, sin viñetas ni listas numeradas, sin emojis. \
Si tenés que enumerar, decilo en una oración ("tenés tres cosas: primero…, después…, y por último…").
- Números, fechas y horas como se dicen: "el jueves 13", "cincuenta dólares", "a las tres de la tarde".
- Si algo no está en los datos, decilo sin vueltas. No inventes.
- Para un saludo o el briefing ("buen día, ¿qué hay para hoy?"): saludá por el nombre según la hora y contá lo más importante del día, \
lo urgente primero.`

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

/** Por encima de esto, la voz lee solo el principio (cuida los créditos de ElevenLabs) y la pantalla muestra todo. */
export const MAX_VOZ = 600

/** Corta en la última oración completa que entra en el límite. */
export function recortarOraciones(texto: string, max: number): string {
  if (texto.length <= max) return texto
  const corte = texto.slice(0, max)
  const fin = Math.max(corte.lastIndexOf('. '), corte.lastIndexOf('? '), corte.lastIndexOf('! '))
  return fin > max / 3 ? corte.slice(0, fin + 1) : corte.replace(/\s+\S*$/, '') + '…'
}

/** La charla previa como turnos y, al final, el panorama de hoy y la memoria junto a la pregunta actual. */
export function armarMensajes(panorama: string, memoria: string, pregunta: string, historial: Turno[]): Anthropic.Beta.BetaMessageParam[] {
  const mensajes: Anthropic.Beta.BetaMessageParam[] = []
  for (const t of historial) {
    const role = t.rol === 'usuario' ? 'user' : 'assistant'
    // La API exige alternar y empezar por el usuario: se juntan los turnos seguidos del mismo rol
    const ultimo = mensajes[mensajes.length - 1]
    if (ultimo?.role === role && typeof ultimo.content === 'string') ultimo.content += `\n${t.texto}`
    else if (mensajes.length || role === 'user') mensajes.push({ role, content: t.texto })
  }
  if (mensajes[mensajes.length - 1]?.role === 'user') mensajes.push({ role: 'assistant', content: '(sin respuesta)' })
  mensajes.push({
    role: 'user',
    content: `<panorama_de_hoy>\n${panorama}\n</panorama_de_hoy>\n\n<memoria>\n${memoria}\n</memoria>\n\n<pregunta>${pregunta}</pregunta>`,
  })
  return mensajes
}

export interface Resultado {
  respuesta: string
  /** Lo que se lee en voz alta: el principio de la respuesta si es larga */
  respuesta_voz: string
  modelo: string
  consultas: string[] // herramientas usadas, para mostrar en pantalla
}

/** Avisos en vivo mientras responde. */
export type Evento = { tipo: 'texto'; delta: string } | { tipo: 'consulta'; nombre: string } | { tipo: 'nueva_vuelta' }

const fin = (respuesta: string, modelo: string, consultas: string[]): Resultado => ({
  respuesta,
  respuesta_voz: recortarOraciones(respuesta, MAX_VOZ),
  modelo,
  consultas,
})

export async function responder(
  hub: Hub,
  memoria: Memoria,
  panorama: string,
  notas: string,
  pregunta: string,
  historial: Turno[],
  avisar: (e: Evento) => void = () => {},
): Promise<Resultado> {
  const client = new Anthropic() // lee ANTHROPIC_API_KEY, igual que "grabaciones"
  const mensajes = armarMensajes(panorama, notas, pregunta, historial)
  const consultas: string[] = []
  const anotar = (nombre: string) => {
    const n = NOMBRE_CONSULTA[nombre] ?? nombre
    consultas.push(nombre)
    avisar({ tipo: 'consulta', nombre: n })
  }

  for (let vuelta = 1; vuelta <= MAX_VUELTAS; vuelta++) {
    const ultima = vuelta === MAX_VUELTAS
    if (vuelta > 1) avisar({ tipo: 'nueva_vuelta' })
    const stream = client.beta.messages.stream({
      model: MODELO,
      max_tokens: 8000,
      // Si el modelo rechaza el pedido, la API lo reintenta sola con un modelo de respaldo.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' }, // respuestas rápidas para conversar
      // Instrucciones y herramientas no cambian entre preguntas: van en caché (más rápido y más barato)
      system: [{ type: 'text', text: SISTEMA, cache_control: { type: 'ephemeral' } }],
      tools: [...HERRAMIENTAS, ...HERRAMIENTAS_MEMORIA, ...HERRAMIENTAS_WEB],
      // En la última vuelta ya no consulta más: responde con lo que tiene
      tool_choice: ultima ? { type: 'none' } : { type: 'auto' },
      messages: mensajes,
    })
    for await (const e of stream) {
      if (e.type === 'content_block_delta' && e.delta.type === 'text_delta') avisar({ tipo: 'texto', delta: e.delta.text })
      else if (e.type === 'content_block_start' && e.content_block.type === 'server_tool_use') anotar(e.content_block.name)
    }
    const response = await stream.finalMessage()

    if (response.stop_reason === 'refusal') {
      return fin('Perdón, esa no la puedo responder. Probá preguntándome de otra forma.', response.model, consultas)
    }

    // La búsqueda web se tomó una pausa: se reenvía el turno tal cual y el servidor sigue solo
    if (response.stop_reason === 'pause_turn' && !ultima) {
      mensajes.push({ role: 'assistant', content: response.content })
      continue
    }

    const usos = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
    if (response.stop_reason === 'tool_use' && usos.length && !ultima) {
      // Se devuelve el turno completo tal cual (incluidos los bloques de razonamiento)
      mensajes.push({ role: 'assistant', content: response.content })
      const resultados = await Promise.all(
        usos.map(async (u): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
          anotar(u.name)
          try {
            return { type: 'tool_result', tool_use_id: u.id, content: await ejecutar(hub, memoria, u.name, u.input as Record<string, unknown>) }
          } catch (e) {
            return { type: 'tool_result', tool_use_id: u.id, content: `Error: ${e instanceof Error ? e.message : e}`, is_error: true }
          }
        }),
      )
      // Todos los resultados juntos en un solo mensaje
      mensajes.push({ role: 'user', content: resultados })
      continue
    }

    const texto = response.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('') // con búsqueda web, el texto viene partido en varios bloques (por las citas)
    return fin(limpiarParaVoz(texto) || 'No me salió una respuesta. ¿Me lo repetís?', response.model, consultas)
  }
  return fin('Me enredé buscando los datos. ¿Me lo preguntás de otra forma?', MODELO, consultas)
}
