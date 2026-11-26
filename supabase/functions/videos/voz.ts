// Voz en off del video: un MP3 por escena con ElevenLabs ("with-timestamps": trae el tiempo de cada letra,
// así los subtítulos marcan la palabra que se está diciendo). Sin la clave, el video sale sin voz y los
// tiempos se estiman por el largo del texto.

/** "Fran": la voz del video de Alcione Deco (español neutro, amigable). Se cambia con el secret VIDEO_VOZ_ID. */
const VOZ_POR_DEFECTO = 'crQgCQuWgUucmYHEPsrB'
const MODELO = 'eleven_multilingual_v2' // el más natural: acá importa cómo suena, no que arranque rápido
const AJUSTES = { stability: 0.45, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true }
/** Segundos por letra cuando no hay voz (≈ 15 letras por segundo, como habla la voz) */
const SEG_POR_LETRA = 0.066

export interface Palabra {
  w: string
  s: number
  e: number
}
export interface AudioEscena {
  escena: number
  path: string | null
  duracion: number
  palabras: Palabra[]
}

export const vozConfigurada = () => Boolean(Deno.env.get('ELEVENLABS_API_KEY'))

/** Palabras con su tiempo a partir de las letras (de ElevenLabs o estimadas). */
function palabrasDe(chars: string[], inicios: number[], fines: number[]): Palabra[] {
  const out: Palabra[] = []
  let w = ''
  let s: number | null = null
  let e = 0
  const cerrar = () => {
    if (w.trim() && s != null) out.push({ w: w.trim(), s: +s.toFixed(3), e: +e.toFixed(3) })
    w = ''
    s = null
  }
  chars.forEach((c, k) => {
    if (/\s/.test(c)) return cerrar()
    if (s == null) s = inicios[k]
    w += c
    e = fines[k]
  })
  cerrar()
  return out
}

export function estimar(escena: number, texto: string): AudioEscena {
  const chars = [...texto]
  const palabras = palabrasDe(
    chars,
    chars.map((_, k) => k * SEG_POR_LETRA),
    chars.map((_, k) => (k + 1) * SEG_POR_LETRA),
  )
  return { escena, path: null, duracion: +(chars.length * SEG_POR_LETRA).toFixed(3), palabras }
}

function motivo(status: number, detalle: string): string {
  if (status === 401) return 'La clave de ElevenLabs no es válida.'
  if (status === 429 || /quota|credits/i.test(detalle)) return 'Se terminaron los créditos de ElevenLabs de este mes.'
  if (status === 404 || /voice_not_found/i.test(detalle)) return 'No encontré la voz del video en tu cuenta de ElevenLabs.'
  return `ElevenLabs respondió ${status}.`
}

/** Pide la voz de una escena. previa/siguiente le dan contexto para que la entonación siga de una a otra. */
async function sintetizar(texto: string, previa: string | null, siguiente: string | null): Promise<{ mp3: Uint8Array<ArrayBuffer>; palabras: Palabra[]; duracion: number }> {
  const clave = Deno.env.get('ELEVENLABS_API_KEY')!
  const voz = Deno.env.get('VIDEO_VOZ_ID') || VOZ_POR_DEFECTO
  let ultimo = ''
  for (let intento = 0; intento < 2; intento++) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voz)}/with-timestamps?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': clave, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(40000),
      body: JSON.stringify({
        text: texto,
        model_id: MODELO,
        voice_settings: AJUSTES,
        ...(previa ? { previous_text: previa } : {}),
        ...(siguiente ? { next_text: siguiente } : {}),
      }),
    })
    if (res.ok) {
      const j = (await res.json()) as {
        audio_base64: string
        alignment: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] }
      }
      const a = j.alignment
      const mp3 = Uint8Array.from(atob(j.audio_base64), (c) => c.charCodeAt(0))
      return {
        mp3,
        palabras: palabrasDe(a.characters, a.character_start_times_seconds, a.character_end_times_seconds),
        duracion: +(a.character_end_times_seconds.at(-1) ?? 0).toFixed(3),
      }
    }
    const detalle = await res.text().catch(() => '')
    ultimo = motivo(res.status, detalle)
    console.error('ElevenLabs', res.status, detalle.slice(0, 300))
    if (res.status !== 429 && res.status < 500) break // reintentar solo si está ocupado o falló del lado de ellos
    await new Promise((r) => setTimeout(r, 1500))
  }
  throw new Error(ultimo)
}

/**
 * La voz de todas las escenas, de a 3 a la vez (más rápido, sin pasarse del límite de ElevenLabs).
 * `subir` guarda el MP3 y devuelve su ruta.
 */
export async function vozDeEscenas(narraciones: string[], subir: (i: number, mp3: Uint8Array<ArrayBuffer>) => Promise<string>): Promise<AudioEscena[]> {
  const out: AudioEscena[] = new Array(narraciones.length)
  let siguiente = 0
  const trabajar = async () => {
    while (siguiente < narraciones.length) {
      const i = siguiente++
      const r = await sintetizar(narraciones[i], narraciones[i - 1] ?? null, narraciones[i + 1] ?? null)
      out[i] = { escena: i, path: await subir(i, r.mp3), duracion: r.duracion, palabras: r.palabras }
    }
  }
  await Promise.all([trabajar(), trabajar(), trabajar()])
  return out
}
