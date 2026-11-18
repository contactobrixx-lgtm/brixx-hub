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
// Cómo cambiar la voz: desde el hub, en /jarvis → Voz (Voice ID, modelo y energía). También se puede
// cargar el secret ELEVENLABS_VOICE_ID. No hace falta tocar el código.
// Si falta la clave, responde 503 y el hub usa la voz del dispositivo.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

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

// deno-lint-ignore no-explicit-any
type Cliente = SupabaseClient<any, any, any>

/** Devuelve el cliente con la sesión del socio, o null si no es miembro. */
async function miembro(req: Request): Promise<Cliente | null> {
  const auth = req.headers.get('Authorization')
  if (!auth) return null
  const cliente = createClient(URL_SUPABASE, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } })
  const { data, error } = await cliente.rpc('es_miembro')
  return !error && data === true ? cliente : null
}

// La voz elegida en el hub (/jarvis → Voz). Se guarda un minuto para no consultar la base en cada oración.
let elegida: { voz: string | null; modelo: string | null; energia: Energia | null; hasta: number } | null = null
async function vozElegida(cliente: Cliente): Promise<{ voz: string | null; modelo: string | null; energia: Energia | null }> {
  if (elegida && elegida.hasta > Date.now()) return elegida
  const { data } = await cliente.from('ajustes').select('*').maybeSingle()
  const d = (data ?? {}) as Record<string, unknown>
  elegida = {
    voz: typeof d.jarvis_voz_id === 'string' && d.jarvis_voz_id.trim() ? d.jarvis_voz_id.trim() : null,
    modelo: typeof d.jarvis_voz_modelo === 'string' && d.jarvis_voz_modelo.trim() ? d.jarvis_voz_modelo.trim() : null,
    energia: esEnergia(d.jarvis_voz_energia) ? d.jarvis_voz_energia : null,
    hasta: Date.now() + 60_000,
  }
  return elegida
}

const MODELOS = ['eleven_flash_v2_5', 'eleven_multilingual_v2', 'eleven_turbo_v2_5']

/** Energía de la voz (/jarvis → Voz): más expresión y un poco más de velocidad a medida que sube. */
export type Energia = 'calmo' | 'animado' | 'energico'
const AJUSTES_ENERGIA: Record<Energia, Record<string, number | boolean>> = {
  calmo: { stability: 0.55, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true, speed: 1 },
  animado: { stability: 0.42, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true, speed: 1.05 },
  energico: { stability: 0.32, similarity_boost: 0.8, style: 0.5, use_speaker_boost: true, speed: 1.1 },
}
const esEnergia = (x: unknown): x is Energia => typeof x === 'string' && x in AJUSTES_ENERGIA

/** Pide el audio a ElevenLabs. Los modelos v2.5 aceptan forzar el idioma; si lo rechazan, reintenta sin él. */
export async function sintetizar(texto: string, clave: string, vozId: string, modelo: string, energia: Energia = 'calmo'): Promise<Response> {
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
        voice_settings: AJUSTES_ENERGIA[energia],
      }),
    })
  let res = await pedir(aceptaIdioma)
  if (aceptaIdioma && (res.status === 400 || res.status === 422)) res = await pedir(false)
  return res
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)
  const cliente = await miembro(req)
  if (!cliente) return json({ error: 'No autorizado' }, 401)

  // voz_id / modelo / energia: para "Probar" una voz antes de guardarla
  let body: { accion?: string; texto?: unknown; voz_id?: unknown; modelo?: unknown; energia?: unknown }
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
    // Prioridad: lo que se prueba > lo elegido en el hub > los secrets > la voz por defecto
    const hub = await vozElegida(cliente)
    const vozPrueba = typeof body.voz_id === 'string' && /^[A-Za-z0-9]{10,40}$/.test(body.voz_id.trim()) ? body.voz_id.trim() : null
    const modeloPrueba = typeof body.modelo === 'string' && MODELOS.includes(body.modelo) ? body.modelo : null
    const res = await sintetizar(
      texto,
      clave,
      vozPrueba || hub.voz || Deno.env.get('ELEVENLABS_VOICE_ID') || VOZ_POR_DEFECTO,
      modeloPrueba || (hub.modelo && MODELOS.includes(hub.modelo) ? hub.modelo : null) || Deno.env.get('ELEVENLABS_MODEL') || MODELO_POR_DEFECTO,
      esEnergia(body.energia) ? body.energia : hub.energia ?? 'calmo',
    )
    if (!res.ok) {
      const detalle = await res.text().catch(() => '')
      console.error('ElevenLabs', res.status, detalle.slice(0, 300))
      const motivo =
        res.status === 401
          ? 'La clave de ElevenLabs no es válida.'
          : res.status === 429 || /quota|credits/i.test(detalle)
            ? 'Se terminaron los créditos de ElevenLabs de este mes.'
            : res.status === 404 || /voice_not_found|voice not found/i.test(detalle)
              ? 'No encontré esa voz en tu cuenta de ElevenLabs: agregala a "My Voices" y copiá su Voice ID.'
              : /voice.*(permission|library|tier|subscription)|paid/i.test(detalle)
                ? 'Esa voz no está disponible en tu plan de ElevenLabs.'
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
