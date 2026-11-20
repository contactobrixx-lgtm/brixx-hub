// Videos automáticos: la función "grabaciones" llama a "videos" cuando termina el análisis de una intervención o
// reunión con cliente. Como en ese momento no hay sesión de un socio (puede venir del aviso del proveedor de
// transcripción), la llamada lleva una firma interna (HMAC con la clave de servicio, que solo tienen las funciones).

const URL_SUPABASE = Deno.env.get('SUPABASE_URL')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

export async function firmaInterna(): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SERVICE), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('brixx:videos-interno'))
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Cabeceras para que una función llame a "videos" sin sesión de socio */
export async function cabecerasInternas(): Promise<Record<string, string>> {
  return { apikey: ANON, Authorization: `Bearer ${ANON}`, 'x-brixx-interno': await firmaInterna(), 'content-type': 'application/json' }
}

/** Pide los videos automáticos de una grabación ya analizada (si están prendidos en ajustes). No tira error. */
export async function pedirVideosAutomaticos(grabacionId: string) {
  try {
    const r = await fetch(`${URL_SUPABASE}/functions/v1/videos`, {
      method: 'POST',
      headers: await cabecerasInternas(),
      body: JSON.stringify({ accion: 'automatico', grabacion_id: grabacionId }),
      signal: AbortSignal.timeout(15000),
    })
    if (!r.ok) console.error('Videos automáticos:', r.status, (await r.text().catch(() => '')).slice(0, 200))
  } catch (e) {
    console.error('No se pudieron pedir los videos automáticos:', e)
  }
}
