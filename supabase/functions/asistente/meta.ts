// Instagram por la API oficial de Meta (Graph API, "Business Discovery"): con la cuenta de Instagram de
// empresa de brixx se leen los datos PÚBLICOS de cualquier otra cuenta de empresa o creador: perfil,
// seguidores y sus últimas publicaciones con me gusta y comentarios. Las métricas se calculan acá, en
// código (frecuencia, interacción, formatos, mejores publicaciones), así Claude no inventa números.
// Solo lee. Las cuentas personales no se pueden consultar (Meta no lo permite).
// Secrets: META_ACCESS_TOKEN (token de un usuario del sistema de Meta Business, no vence),
// META_IG_USER_ID (opcional: id de la cuenta de Instagram de empresa de brixx; si falta, se busca solo con el
// token entre las páginas de Facebook que maneja), META_GRAPH_VERSION (opcional).

import { bienFormado, recortar } from './datos.ts'

const VERSION = () => Deno.env.get('META_GRAPH_VERSION') || 'v23.0'

export const metaConfigurado = () => Boolean(Deno.env.get('META_ACCESS_TOKEN'))

let igCache: string | null = null
/** La cuenta de Instagram de empresa de brixx: el secret o la primera conectada a una página que maneja el token */
async function cuentaPropia(): Promise<string> {
  const env = Deno.env.get('META_IG_USER_ID')
  if (env) return env
  if (igCache) return igCache
  const r = await fetch(`https://graph.facebook.com/${VERSION()}/me/accounts?fields=name,instagram_business_account&limit=50`, {
    headers: { Authorization: `Bearer ${Deno.env.get('META_ACCESS_TOKEN')}` },
    signal: AbortSignal.timeout(10_000),
  })
  const j = await r.json().catch(() => null)
  if (!r.ok) throw new ErrorMeta(`La conexión con Meta no anda (${j?.error?.message ?? r.status}). Revisá el token.`, 'token')
  const id = (j?.data ?? []).map((p: { instagram_business_account?: { id: string } }) => p.instagram_business_account?.id).find(Boolean)
  if (!id)
    throw new ErrorMeta(
      'El token de Meta no tiene ninguna página de Facebook con un Instagram de empresa conectado. Conectá el Instagram de brixx a su página y dale acceso al usuario del sistema.',
      'token',
    )
  igCache = id
  return id
}

/** "@alcione.deco", "instagram.com/alcione.deco/?hl=es" o "alcione.deco" → "alcione.deco" */
export function usuarioInstagram(texto: string): string | null {
  const t = texto.trim()
  const url = /instagram\.com\/([A-Za-z0-9._]{1,30})/i.exec(t)
  const u = (url ? url[1] : t.replace(/^@/, '')).toLowerCase()
  if (!/^[a-z0-9._]{1,30}$/.test(u) || ['p', 'reel', 'reels', 'stories', 'explore'].includes(u)) return null
  return u
}

interface Media {
  id: string
  caption?: string
  like_count?: number
  comments_count?: number
  media_type?: string
  media_product_type?: string
  timestamp: string
  permalink?: string
}

export interface PerfilInstagram {
  usuario: string
  nombre: string | null
  biografia: string | null
  web: string | null
  foto: string | null
  seguidores: number
  seguidos: number
  publicaciones: number
  metricas: MetricasInstagram
  ultimas: { fecha: string; tipo: string; me_gusta: number | null; comentarios: number | null; link: string | null; texto: string }[]
}

export interface MetricasInstagram {
  analizadas: number
  por_semana: number | null
  dias_desde_ultima: number | null
  promedio_me_gusta: number | null
  promedio_comentarios: number | null
  /** (me gusta + comentarios) / seguidores, promedio por publicación, en % */
  interaccion_pct: number | null
  formatos: Record<string, number>
  /** Interacción promedio por formato (me gusta + comentarios) */
  interaccion_por_formato: Record<string, number>
  hashtags: string[]
  mejores: { link: string | null; tipo: string; interaccion: number; texto: string }[]
}

/**
 * Texto seguro para guardar: sin mitades de emoji (un recorte por posición puede partir un emoji en dos y la base
 * rechaza el JSON: "Empty or invalid json"). Recorta por caracteres completos y limpia lo que venga roto.
 */
export function textoSeguro(t: string | null | undefined, max?: number): string {
  const limpio = bienFormado((t ?? '').replace(/\s+/g, ' ').trim())
  return max ? recortar(limpio, max) : limpio
}

const tipoDe = (m: Media) =>
  m.media_product_type === 'REELS' ? 'reel' : m.media_type === 'CAROUSEL_ALBUM' ? 'carrusel' : m.media_type === 'VIDEO' ? 'video' : 'foto'
const redondo = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d

function calcular(media: Media[], seguidores: number): MetricasInstagram {
  const ahora = Date.now()
  const fechas = media.map((m) => new Date(m.timestamp).getTime()).sort((a, b) => b - a)
  const conMg = media.filter((m) => typeof m.like_count === 'number')
  const inter = (m: Media) => (m.like_count ?? 0) + (m.comments_count ?? 0)
  const formatos: Record<string, number> = {}
  const sumaFormato: Record<string, number> = {}
  for (const m of media) {
    const t = tipoDe(m)
    formatos[t] = (formatos[t] ?? 0) + 1
    sumaFormato[t] = (sumaFormato[t] ?? 0) + inter(m)
  }
  const hashtags = new Map<string, number>()
  for (const m of media) for (const h of (m.caption ?? '').toLowerCase().match(/#[\p{L}\p{N}_]+/gu) ?? []) hashtags.set(h, (hashtags.get(h) ?? 0) + 1)
  // Frecuencia: publicaciones por semana en el tramo que cubren las analizadas (mínimo una semana)
  const tramo = fechas.length > 1 ? Math.max(7, (fechas[0] - fechas[fechas.length - 1]) / 864e5) : null
  return {
    analizadas: media.length,
    por_semana: tramo ? redondo((media.length / tramo) * 7) : null,
    dias_desde_ultima: fechas.length ? Math.floor((ahora - fechas[0]) / 864e5) : null,
    promedio_me_gusta: conMg.length ? Math.round(conMg.reduce((a, m) => a + (m.like_count ?? 0), 0) / conMg.length) : null,
    promedio_comentarios: media.length ? redondo(media.reduce((a, m) => a + (m.comments_count ?? 0), 0) / media.length) : null,
    interaccion_pct: conMg.length && seguidores ? redondo((conMg.reduce((a, m) => a + inter(m), 0) / conMg.length / seguidores) * 100, 2) : null,
    formatos,
    interaccion_por_formato: Object.fromEntries(Object.entries(sumaFormato).map(([t, s]) => [t, Math.round(s / formatos[t])])),
    hashtags: [...hashtags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([h]) => h),
    mejores: [...media]
      .sort((a, b) => inter(b) - inter(a))
      .slice(0, 3)
      .map((m) => ({ link: m.permalink ?? null, tipo: tipoDe(m), interaccion: inter(m), texto: textoSeguro(m.caption, 120) })),
  }
}

/** Lee una cuenta de Instagram de empresa o creador por su usuario (datos públicos) */
export async function perfilInstagram(usuario: string): Promise<PerfilInstagram> {
  if (!metaConfigurado()) throw new ErrorMeta('Falta conectar la API de Meta (secret META_ACCESS_TOKEN).', 'sin_meta')
  const campos =
    `business_discovery.username(${usuario}){username,name,biography,website,profile_picture_url,followers_count,follows_count,media_count,` +
    'media.limit(30){id,caption,like_count,comments_count,media_type,media_product_type,timestamp,permalink}}'
  const url = `https://graph.facebook.com/${VERSION()}/${await cuentaPropia()}?fields=${encodeURIComponent(campos)}`
  const r = await fetch(url, { headers: { Authorization: `Bearer ${Deno.env.get('META_ACCESS_TOKEN')}` }, signal: AbortSignal.timeout(15_000) })
  const j = await r.json().catch(() => null)
  if (!r.ok || !j?.business_discovery) {
    const e = j?.error
    // 110 / 2207013 / "Invalid user id": la cuenta no existe o es personal
    if (e && (e.code === 110 || e.error_subcode === 2207013 || /invalid user id|cannot be found|does not exist/i.test(e.message ?? '')))
      throw new ErrorMeta(`No encontré @${usuario} como cuenta de empresa o creador: o no existe, o es personal (Meta no deja leer cuentas personales).`, 'no_encontrada')
    // 10 / 200: el token anda pero le falta un permiso. Con la página asignada por Business Manager (usuario del
    // sistema), Meta pide además ads_read (o ads_management) para Business Discovery.
    if (e && (e.code === 10 || e.code === 200 || (e.code >= 200 && e.code < 300)))
      throw new ErrorMeta(
        `Al token de Meta le falta un permiso (${e.message ?? 'sin permiso'}). Generalo de nuevo sumando ads_read e instagram_manage_insights a los otros cuatro.`,
        'token',
      )
    if (e && (e.code === 190 || e.type === 'OAuthException'))
      throw new ErrorMeta(`La conexión con Meta no anda (${e.message ?? 'token inválido o vencido'}). Hay que renovar el token.`, 'token')
    throw new ErrorMeta(`Meta respondió con un error: ${e?.message ?? r.status}`, 'meta')
  }
  const d = j.business_discovery
  const media: Media[] = d.media?.data ?? []
  const seguidores = Number(d.followers_count ?? 0)
  return {
    usuario: d.username ?? usuario,
    nombre: d.name ? textoSeguro(d.name) : null,
    biografia: d.biography ? textoSeguro(d.biography, 500) : null,
    web: d.website ?? null,
    foto: d.profile_picture_url ?? null,
    seguidores,
    seguidos: Number(d.follows_count ?? 0),
    publicaciones: Number(d.media_count ?? 0),
    metricas: calcular(media, seguidores),
    ultimas: media.slice(0, 12).map((m) => ({
      fecha: m.timestamp.slice(0, 10),
      tipo: tipoDe(m),
      me_gusta: m.like_count ?? null,
      comentarios: m.comments_count ?? null,
      link: m.permalink ?? null,
      texto: textoSeguro(m.caption, 140),
    })),
  }
}

export class ErrorMeta extends Error {
  constructor(
    mensaje: string,
    readonly motivo: 'sin_meta' | 'no_encontrada' | 'token' | 'meta',
  ) {
    super(mensaje)
  }
}

const num = (n: number | null | undefined) => (n == null ? 's/d' : n.toLocaleString('es-AR'))

/** El perfil en texto para Claude (números calculados acá) */
export function textoPerfil(p: PerfilInstagram, previo?: { seguidores: number; fecha: string } | null): string {
  const m = p.metricas
  const cambio = previo ? ` (${p.seguidores - previo.seguidores >= 0 ? '+' : ''}${(p.seguidores - previo.seguidores).toLocaleString('es-AR')} desde el ${previo.fecha})` : ''
  return [
    `INSTAGRAM @${p.usuario}${p.nombre ? ` · ${p.nombre}` : ''} (datos reales de la API de Meta, ${new Date().toISOString().slice(0, 10)})`,
    `Seguidores: ${num(p.seguidores)}${cambio} · Seguidos: ${num(p.seguidos)} · Publicaciones: ${num(p.publicaciones)}`,
    p.biografia ? `Bio: ${p.biografia.replace(/\s+/g, ' ')}` : 'Bio: vacía',
    `Web en la bio: ${p.web ?? 'no tiene'}`,
    `Últimas ${m.analizadas} publicaciones: ${m.por_semana ?? 's/d'} por semana · la última hace ${m.dias_desde_ultima ?? 's/d'} días`,
    `Promedio por publicación: ${num(m.promedio_me_gusta)} me gusta y ${m.promedio_comentarios ?? 's/d'} comentarios · interacción ${m.interaccion_pct ?? 's/d'}% de los seguidores`,
    `Formatos: ${Object.entries(m.formatos).map(([t, n]) => `${t} ${n} (interacción prom. ${m.interaccion_por_formato[t]})`).join(', ') || 's/d'}`,
    `Hashtags más usados: ${m.hashtags.join(' ') || 'ninguno'}`,
    'Mejores publicaciones:',
    ...m.mejores.map((x) => `- ${x.tipo}, ${x.interaccion} interacciones: "${x.texto}" ${x.link ?? ''}`),
    'Últimas publicaciones:',
    ...p.ultimas.slice(0, 8).map((x) => `- ${x.fecha} ${x.tipo}: ${x.me_gusta ?? 'oculto'} me gusta, ${x.comentarios ?? 0} comentarios · "${x.texto}"`),
    'Referencia: en cuentas de comercios chicos, una interacción de 1 a 3% es normal, más de 3% es buena y menos de 0,5% es baja.',
  ].join('\n')
}

/**
 * Diagnóstico de la conexión con Meta (sin mostrar el token): quién es el token, qué permisos tiene de verdad,
 * qué páginas e Instagram ve y si puede leer la propia cuenta y otra cuenta de empresa conocida.
 */
export async function diagnosticoMeta(usuarioPrueba?: string | null): Promise<string[]> {
  if (!metaConfigurado()) return ['No hay META_ACCESS_TOKEN cargado en Supabase.']
  const get = async (ruta: string) => {
    const r = await fetch(`https://graph.facebook.com/${VERSION()}/${ruta}`, {
      headers: { Authorization: `Bearer ${Deno.env.get('META_ACCESS_TOKEN')}` },
      signal: AbortSignal.timeout(10_000),
    })
    const j = await r.json().catch(() => null)
    return { ok: r.ok, j, error: j?.error ? `(#${j.error.code}${j.error.error_subcode ? `/${j.error.error_subcode}` : ''}) ${j.error.message}` : null }
  }
  const lineas: string[] = [`Versión de la API: ${VERSION()}`]
  const yo = await get('me?fields=id,name')
  lineas.push(yo.ok ? `Token de: ${yo.j.name} (${yo.j.id})` : `Token: ERROR ${yo.error}`)
  const permisos = await get('me/permissions')
  if (permisos.ok) {
    const dados = (permisos.j.data ?? []).filter((p: { status: string }) => p.status === 'granted').map((p: { permission: string }) => p.permission)
    const faltan = ['instagram_basic', 'pages_show_list', 'pages_read_engagement', 'business_management', 'ads_read'].filter((p) => !dados.includes(p))
    lineas.push(`Permisos del token: ${dados.join(', ') || 'ninguno'}`)
    lineas.push(faltan.length ? `FALTAN: ${faltan.join(', ')}` : 'Están todos los permisos necesarios.')
  } else lineas.push(`Permisos: ERROR ${permisos.error}`)
  const paginas = await get('me/accounts?fields=name,tasks,instagram_business_account{id,username}&limit=50')
  let propia: { id: string; username: string } | null = null
  if (paginas.ok) {
    const lista = paginas.j.data ?? []
    if (!lista.length) lineas.push('Páginas de Facebook que ve: ninguna (asignale la página al usuario del sistema).')
    for (const p of lista) {
      const ig = p.instagram_business_account
      if (ig && !propia) propia = ig
      lineas.push(`Página: ${p.name} · tareas: ${(p.tasks ?? []).join(', ') || 'ninguna'} · Instagram: ${ig ? `@${ig.username} (${ig.id})` : 'no conectado'}`)
    }
  } else lineas.push(`Páginas: ERROR ${paginas.error}`)
  const igId = Deno.env.get('META_IG_USER_ID') || propia?.id
  if (!igId) return [...lineas, 'No encontré una cuenta de Instagram de empresa para hacer las consultas.']
  const cuenta = await get(`${igId}?fields=username,followers_count,media_count`)
  lineas.push(cuenta.ok ? `Cuenta propia: @${cuenta.j.username}, ${cuenta.j.followers_count} seguidores` : `Cuenta propia: ERROR ${cuenta.error}`)
  const probar = async (u: string) => {
    const r = await get(`${igId}?fields=${encodeURIComponent(`business_discovery.username(${u}){username,followers_count}`)}`)
    lineas.push(r.ok ? `Leer @${u}: OK (${r.j.business_discovery?.followers_count} seguidores)` : `Leer @${u}: ERROR ${r.error}`)
  }
  if (propia?.username) await probar(propia.username)
  await probar('instagram')
  if (usuarioPrueba) await probar(usuarioPrueba)
  return lineas
}
