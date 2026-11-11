// Proveedor de transcripción: AssemblyAI.
// Para cambiar de proveedor, reemplazar este archivo manteniendo las mismas funciones.

export interface Segmento {
  hablante: string // "A", "B", ...
  inicio_ms: number
  fin_ms: number
  texto: string
}

export type ResultadoTranscripcion =
  | { estado: 'procesando' }
  | { estado: 'error'; error: string }
  | { estado: 'lista'; segmentos: Segmento[]; duracion_seg: number | null }

const API = 'https://api.assemblyai.com/v2'

export const assemblyConfigurado = () => Boolean(Deno.env.get('ASSEMBLYAI_API_KEY'))

function headers() {
  return { authorization: Deno.env.get('ASSEMBLYAI_API_KEY')!, 'content-type': 'application/json' }
}

interface Envio {
  audioUrl: string
  webhookUrl: string
  webhookHeader: { nombre: string; valor: string }
}

/** Manda el audio a transcribir. Devuelve el id del trabajo en AssemblyAI. */
export async function enviarATranscribir({ audioUrl, webhookUrl, webhookHeader }: Envio): Promise<string> {
  const base = {
    audio_url: audioUrl,
    language_code: 'es',
    speaker_labels: true,
    punctuate: true,
    format_text: true,
    webhook_url: webhookUrl,
    webhook_auth_header_name: webhookHeader.nombre,
    webhook_auth_header_value: webhookHeader.valor,
  }
  // Modelo recomendado para audio grabado; si la API no lo acepta, se reintenta con el modelo por defecto.
  let res = await fetch(`${API}/transcript`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ ...base, speech_models: ['universal-3-5-pro', 'universal-2'] }),
  })
  if (res.status === 400) {
    res = await fetch(`${API}/transcript`, { method: 'POST', headers: headers(), body: JSON.stringify(base) })
  }
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.id) {
    throw new Error(`AssemblyAI rechazó el audio (${res.status}): ${json.error ?? 'sin detalle'}`)
  }
  return json.id as string
}

interface Utterance {
  speaker?: string
  start?: number
  end?: number
  text?: string
}

/** Consulta un trabajo de transcripción. */
export async function consultarTranscripcion(id: string): Promise<ResultadoTranscripcion> {
  const res = await fetch(`${API}/transcript/${encodeURIComponent(id)}`, { headers: headers() })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) return { estado: 'error', error: `AssemblyAI respondió ${res.status}: ${json.error ?? 'sin detalle'}` }
  if (json.status === 'error') return { estado: 'error', error: `AssemblyAI no pudo transcribir: ${json.error ?? 'sin detalle'}` }
  if (json.status !== 'completed') return { estado: 'procesando' }
  return { estado: 'lista', segmentos: aSegmentos(json), duracion_seg: json.audio_duration ? Math.round(json.audio_duration) : null }
}

/** Normaliza la respuesta (exportada para tests). */
export function aSegmentos(json: { utterances?: Utterance[] | null; text?: string | null }): Segmento[] {
  const utt = json.utterances ?? []
  if (utt.length) {
    return utt
      .filter((u) => u.text?.trim())
      .map((u) => ({ hablante: u.speaker || 'A', inicio_ms: u.start ?? 0, fin_ms: u.end ?? 0, texto: u.text!.trim() }))
  }
  // Sin separación de hablantes: un solo bloque
  return json.text?.trim() ? [{ hablante: 'A', inicio_ms: 0, fin_ms: 0, texto: json.text.trim() }] : []
}
