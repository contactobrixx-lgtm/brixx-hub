// Edge Function "voz": convierte el texto de Jarvis en audio con ElevenLabs.
//
// Pedido (POST JSON, con la sesión del usuario):
//   { accion: "config" }   → { elevenlabs: boolean }
//   { texto: string }      → audio MP3 (como application/octet-stream)
//
// Secrets en Supabase (Edge Functions → Secrets):
//   ELEVENLABS_API_KEY   (obligatorio para la voz premium)
//   ELEVENLABS_VOICE_ID  (opcional: la voz elegida en ElevenLabs; por defecto "Daniel")
//   ELEVENLABS_MODEL     (opcional: por defecto eleven_flash_v2_5, el más rápido)
// Si falta la clave, responde 503 y el hub usa la voz del dispositivo.
import { createClient } from 'npm:@supabase/supabase-js@2'

const URL_SUPABASE = Deno.env.get('SUPABASE_URL')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!

const VOZ_POR_DEFECTO = 'onwK4e9ZLuTAKqWW03F9' // "Daniel": grave, sobria, de locutor
const MODELO_POR_DEFECTO = 'eleven_flash_v2_5'
const MAX_TEXTO = 1500

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })

async function esMiembro(req: Request): Promise<boolean> {
  const auth = req.headers.get('Authorization')
  if (!auth) return false
  const cliente = createClient(URL_SUPABASE, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } })
  const { data, error } = await cliente.rpc('es_miembro')
  return !error && data === true
}

/** Pide el audio a ElevenLabs. Si el modelo no acepta el idioma forzado, reintenta sin él. */
export async function sintetizar(texto: string, clave: string, vozId: string, modelo: string): Promise<Response> {
  const pedir = (conIdioma: boolean) =>
    fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(vozId)}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': clave, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({
        text: texto,
        model_id: modelo,
        ...(conIdioma ? { language_code: 'es' } : {}),
        // Calma y consistente, con un poco de expresión
        voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true },
      }),
    })
  let res = await pedir(true)
  if (res.status === 400 || res.status === 422) res = await pedir(false)
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

  const texto = typeof body.texto === 'string' ? body.texto.trim().slice(0, MAX_TEXTO) : ''
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
    return json({ error: 'No se pudo generar la voz.' }, 502)
  }
})
