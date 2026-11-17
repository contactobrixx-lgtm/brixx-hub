// Edge Function "voz": convierte el texto de Jarvis en audio con ElevenLabs.
//
// Pedido (POST JSON, con la sesión del usuario):
//   { accion: "config" }   → { elevenlabs: boolean }
//   { texto: string }      → audio MP3 (como application/octet-stream)
//
// Secrets en Supabase (Edge Functions → Secrets):
//   ELEVENLABS_API_KEY   (obligatorio para la voz premium)
//   ELEVENLABS_VOICE_ID  (opcional: la voz elegida en ElevenLabs; por defecto "Daniel")
//   ELEVENLABS_MODEL     (opcional: por defecto eleven_flash_v2_5, el más rápido y gasta la mitad de créditos.
//                         Con eleven_multilingual_v2 suena un poco más natural, pero tarda más en arrancar)
//
// Cómo cambiar la voz: en ElevenLabs → Voices → Voice Library, elegí una, agregala a "My Voices",
// copiá su Voice ID y cargalo en Supabase como secret ELEVENLABS_VOICE_ID. No hace falta tocar el código.
// Si falta la clave, responde 503 y el hub usa la voz del dispositivo.
import { createClient } from 'npm:@supabase/supabase-js@2'

const URL_SUPABASE = Deno.env.get('SUPABASE_URL')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!

const VOZ_POR_DEFECTO = 'onwK4e9ZLuTAKqWW03F9' // "Daniel" (voz prediseñada): grave, sobria, de locutor
const MODELO_POR_DEFECTO = 'eleven_flash_v2_5' // Jarvis habla de a una oración: importa que arranque rápido
// El asistente ya manda un resumen de ≤600 caracteres; esto es un tope de seguridad para cuidar los créditos
const MAX_TEXTO = 700
const TIMEOUT_MS = 15000

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })

/** Corta en una oración completa dentro del tope. */
function recortar(texto: string): string {
  if (texto.length <= MAX_TEXTO) return texto
  const corte = texto.slice(0, MAX_TEXTO)
  const fin = Math.max(corte.lastIndexOf('. '), corte.lastIndexOf('? '), corte.lastIndexOf('! '))
  return fin > MAX_TEXTO / 3 ? corte.slice(0, fin + 1) : corte
}

async function esMiembro(req: Request): Promise<boolean> {
  const auth = req.headers.get('Authorization')
  if (!auth) return false
  const cliente = createClient(URL_SUPABASE, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } })
  const { data, error } = await cliente.rpc('es_miembro')
  return !error && data === true
}

/** Pide el audio a ElevenLabs. Los modelos v2.5 aceptan forzar el idioma; si lo rechazan, reintenta sin él. */
export async function sintetizar(texto: string, clave: string, vozId: string, modelo: string): Promise<Response> {
  const aceptaIdioma = /v2_5|v3/.test(modelo)
  const pedir = (conIdioma: boolean) =>
    fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(vozId)}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': clave, 'content-type': 'application/json', accept: 'audio/mpeg' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        text: texto,
        model_id: modelo,
        ...(conIdioma ? { language_code: 'es' } : {}),
        // Calma y consistente, con un poco de expresión
        voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true },
      }),
    })
  let res = await pedir(aceptaIdioma)
  if (aceptaIdioma && (res.status === 400 || res.status === 422)) res = await pedir(false)
  return res
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)
  if (!(await esMiembro(req))) return json({ error: 'No autorizado' }, 401)

  let body: { accion?: string; texto?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Pedido inválido' }, 400)
  }

  const clave = Deno.env.get('ELEVENLABS_API_KEY')
  if (body.accion === 'config') return json({ elevenlabs: Boolean(clave) })
  if (!clave) return json({ error: 'Falta la clave de ElevenLabs.', falta: 'elevenlabs' }, 503)

  const texto = typeof body.texto === 'string' ? recortar(body.texto.trim()) : ''
  if (!texto) return json({ error: 'Falta el texto' }, 400)

  try {
    const res = await sintetizar(
      texto,
      clave,
      Deno.env.get('ELEVENLABS_VOICE_ID') || VOZ_POR_DEFECTO,
      Deno.env.get('ELEVENLABS_MODEL') || MODELO_POR_DEFECTO,
    )
    if (!res.ok) {
      const detalle = await res.text().catch(() => '')
      console.error('ElevenLabs', res.status, detalle.slice(0, 300))
      const motivo =
        res.status === 401
          ? 'La clave de ElevenLabs no es válida.'
          : res.status === 429 || /quota|credits/i.test(detalle)
            ? 'Se terminaron los créditos de ElevenLabs de este mes.'
            : `ElevenLabs respondió ${res.status}.`
      return json({ error: motivo }, 502)
    }
    // octet-stream: así el cliente de Supabase lo entrega como Blob (con audio/mpeg lo leería como texto)
    return new Response(res.body, { headers: { ...CORS, 'content-type': 'application/octet-stream', 'cache-control': 'no-store' } })
  } catch (e) {
    console.error('Error de voz:', e)
    const tardo = e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError')
    return json({ error: tardo ? 'ElevenLabs tardó demasiado.' : 'No se pudo generar la voz.' }, tardo ? 504 : 502)
  }
})
