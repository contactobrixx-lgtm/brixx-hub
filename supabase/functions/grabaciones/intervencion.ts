// Análisis de una intervención: lo que se carga después de hablar con un cliente o cliente potencial
// (un audio, un texto pegado y/o links de su Instagram o web).
// Devuelve, lo más resumido posible: dolores, cuellos de botella, soluciones y servicios a ofrecer,
// y una propuesta lista para mandarle. Si el cliente no tiene carpeta en el hub, se crea sola.
// Mantener ESQUEMA_INTERVENCION en sincronía con `AnalisisIntervencion` en src/types/db.ts.
import Anthropic from 'npm:@anthropic-ai/sdk@1.8.0'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { MODELO, type ServicioCatalogo } from './analisis.ts'
import type { Segmento } from './transcripcion.ts'

const texto = { type: 'string' }
const textoONull = { anyOf: [{ type: 'string' }, { type: 'null' }] }
const lista = (items: unknown) => ({ type: 'array', items })
const objeto = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
})

export const ESQUEMA_INTERVENCION = objeto({
  cliente: objeto({
    nombre: textoONull,
    empresa: textoONull,
    email: textoONull,
    telefono: textoONull,
    instagram: textoONull,
    web: textoONull,
    rubro: textoONull,
    industria: textoONull,
  }),
  en_una_linea: texto,
  dolores: lista(texto),
  cuellos_de_botella: lista(texto),
  soluciones: lista(objeto({ solucion: texto, servicio_id: textoONull, servicio: texto })),
  falta_saber: lista(texto),
  propuesta: objeto({ asunto: texto, mensaje: texto }),
})

const SISTEMA = `Sos el analista comercial de brixx, una agencia de IA y soluciones digitales de dos socios en Argentina. \
Te paso lo que se cargó después de una intervención con un cliente o cliente potencial: la transcripción de un audio, \
un texto (chat, mail o notas) y/o el contenido de sus links (Instagram, web). Los socios necesitan saber rápido qué le pasa \
y qué ofrecerle: sé MUY resumido, frases cortas, sin repetir la misma idea en dos campos.

Qué devolver (español rioplatense, con voseo, sin markdown):
- cliente: los datos del cliente que aparezcan en el material (nombre de la persona, empresa o marca, email, teléfono, \
usuario de Instagram, web, rubro y industria). null en lo que no aparezca. No inventes. "rubro" es lo que hace (por ejemplo \
"Mueblería"); "industria" el sector amplio (por ejemplo "Retail / decoración").
- en_una_linea: UNA oración con lo que el cliente quiere lograr.
- dolores: de 1 a 4 problemas que le duelen hoy, en pocas palabras cada uno.
- cuellos_de_botella: de 0 a 3 cosas que hoy frenan su negocio o su operación (procesos manuales, falta de canal, etc.).
- soluciones: de 1 a 3 soluciones digitales concretas. En "servicio" el servicio del catálogo que la resuelve y en \
servicio_id su "id" exacto; si no hay uno en el catálogo, servicio_id = null y en "servicio" describilo corto.
- falta_saber: de 0 a 3 preguntas que conviene hacerle para cerrar la propuesta.
- propuesta: un mensaje para mandarle al cliente por WhatsApp o mail, de parte de brixx. "asunto": corto, para el mail. \
"mensaje": cálido y profesional, de 4 a 7 oraciones: qué entendimos que necesita, qué le proponemos y por qué le sirve, \
y un próximo paso concreto (por ejemplo una llamada de 15 minutos). Sin emojis. No pongas precios ni plazos que no estén \
en el material: los precios los mandamos en la cotización.

Reglas: basate solo en el material. Si hay muy poca información, decilo en en_una_linea y llená falta_saber.`

// ---------------------------------------------------------------------------
// Links: se lee lo que se pueda (título, descripción y texto) para darle contexto a Claude.

const MAX_URLS = 5
const MAX_TEXTO_URL = 3000

function urlSegura(u: string): URL | null {
  try {
    const url = new URL(u.trim().match(/^https?:\/\//i) ? u.trim() : `https://${u.trim()}`)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    const host = url.hostname.toLowerCase()
    // Solo sitios públicos: nada de direcciones internas
    if (!host.includes('.') || host === 'localhost' || /^[\d.]+$/.test(host) || host.includes(':') || host.endsWith('.local') || host.endsWith('.internal')) return null
    return url
  } catch {
    return null
  }
}

const decodificar = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')

function meta(html: string, nombre: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${nombre}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${nombre}["']`, 'i')
  const m = html.match(re)
  return m ? decodificar(m[1] ?? m[2] ?? '').trim() || null : null
}

/** Lee un link y devuelve un resumen de texto (o por qué no se pudo). Exportada para tests. */
export async function leerUrl(u: string, fetcher: typeof fetch = fetch): Promise<string> {
  const url = urlSegura(u)
  if (!url) return `${u}: no es un link válido.`
  try {
    const res = await fetcher(url.toString(), {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; brixx-hub/1.0)', accept: 'text/html,*/*;q=0.5' },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return `${url.hostname}: respondió ${res.status}, no se pudo leer.`
    const html = (await res.text()).slice(0, 600_000)
    const titulo = decodificar(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim()
    const descripcion = meta(html, 'og:description') ?? meta(html, 'description')
    const cuerpo = decodificar(
      html
        .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<[^>]+>/g, ' '),
    )
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_TEXTO_URL)
    return [`Link: ${url.toString()}`, titulo && `Título: ${titulo}`, descripcion && `Descripción: ${descripcion}`, cuerpo && `Texto: ${cuerpo}`]
      .filter(Boolean)
      .join('\n')
  } catch (e) {
    return `${url.hostname}: no se pudo leer (${e instanceof Error ? e.name : 'error'}).`
  }
}

// ---------------------------------------------------------------------------
// Carpeta del cliente: buscar una existente o crearla.

export interface DatosCliente {
  nombre: string | null
  empresa: string | null
  email: string | null
  telefono: string | null
  instagram: string | null
  web: string | null
  rubro: string | null
  industria: string | null
}

/** Igual que nombre_comparable() de la base: sin mayúsculas, tildes, "@" ni signos. */
export const comparable = (s: string | null | undefined) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

/** Usuario de Instagram a partir de "@usuario" o de un link. */
export function usuarioInstagram(s: string | null | undefined): string | null {
  if (!s) return null
  const m = s.match(/instagram\.com\/([A-Za-z0-9._]+)/i) ?? s.match(/^@?([A-Za-z0-9._]{2,30})$/)
  const u = m?.[1]?.toLowerCase()
  return u && !['p', 'reel', 'reels', 'stories', 'explore'].includes(u) ? u : null
}

const hostDe = (s: string | null | undefined) => {
  if (!s) return null
  try {
    return new URL(s.match(/^https?:\/\//i) ? s : `https://${s}`).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

/** Separa los links cargados en Instagram y web. */
export function linksDeUrls(urls: string[]): { instagram: string | null; web: string | null } {
  const ig = urls.find((u) => /instagram\.com/i.test(u)) ?? null
  const web = urls.find((u) => !/instagram\.com|wa\.me|whatsapp\.com|facebook\.com|tiktok\.com/i.test(u)) ?? null
  return { instagram: ig, web }
}

interface ProspectoMin {
  id: string
  nombre: string
  empresa: string | null
  email: string | null
  telefono: string | null
  instagram: string | null
  web: string | null
  rubro: string | null
  industria: string | null
  etapa: string
  orden: number
}

/** Busca la carpeta del cliente entre los prospectos (exportada para tests). */
export function buscarCliente(prospectos: ProspectoMin[], c: DatosCliente): ProspectoMin | null {
  const email = c.email?.trim().toLowerCase()
  const ig = usuarioInstagram(c.instagram)
  const host = hostDe(c.web)
  const porDato = prospectos.find(
    (p) =>
      (email && p.email?.trim().toLowerCase() === email) ||
      (ig && usuarioInstagram(p.instagram) === ig) ||
      (host && hostDe(p.web) === host),
  )
  if (porDato) return porDato
  const nombres = [comparable(c.empresa), comparable(c.nombre)].filter((n) => n.length >= 3)
  if (!nombres.length) return null
  return (
    prospectos.find((p) => nombres.includes(comparable(p.empresa))) ??
    prospectos.find((p) => nombres.includes(comparable(p.nombre))) ??
    null
  )
}

const COLUMNAS = 'id, nombre, empresa, email, telefono, instagram, web, rubro, industria, etapa, orden'

/**
 * Devuelve el id de la carpeta del cliente: la que ya estaba vinculada, una que coincida
 * o una nueva en el pipeline (etapa contacto). Completa los datos que falten, sin pisar los cargados.
 */
export async function carpetaDelCliente(
  db: SupabaseClient,
  prospectoId: string | null,
  datos: DatosCliente,
): Promise<{ id: string; creado: boolean }> {
  let p: ProspectoMin | null = null
  let creado = false
  if (prospectoId) {
    const { data } = await db.from('prospectos').select(COLUMNAS).eq('id', prospectoId).maybeSingle()
    p = (data as ProspectoMin | null) ?? null
  }
  if (!p) {
    const { data, error } = await db.from('prospectos').select(COLUMNAS)
    if (error) throw new Error(error.message)
    p = buscarCliente((data ?? []) as ProspectoMin[], datos)
  }
  if (!p) {
    const enContacto = await db.from('prospectos').select('orden').eq('etapa', 'contacto').order('orden', { ascending: false }).limit(1)
    const orden = Number(enContacto.data?.[0]?.orden ?? 0) + 1
    const ig = usuarioInstagram(datos.instagram)
    const nombre = datos.nombre?.trim() || datos.empresa?.trim() || (ig ? `@${ig}` : '') || 'Contacto sin nombre'
    const { data, error } = await db
      .from('prospectos')
      .insert({
        nombre,
        empresa: datos.empresa?.trim() || null,
        etapa: 'contacto',
        orden,
        notas: 'Carpeta creada sola a partir de una intervención cargada en el hub.',
      })
      .select(COLUMNAS)
      .single()
    if (error) throw new Error(`No se pudo crear la carpeta del cliente: ${error.message}`)
    p = data as ProspectoMin
    creado = true
  }

  // Completar lo que falte, sin pisar lo que ya está cargado
  const ig = usuarioInstagram(datos.instagram)
  const faltantes: Record<string, string> = {}
  const completar = (campo: keyof ProspectoMin, valor: string | null | undefined) => {
    const v = valor?.trim()
    if (v && !p![campo]) faltantes[campo] = v
  }
  completar('empresa', datos.empresa)
  completar('email', datos.email)
  completar('telefono', datos.telefono)
  completar('instagram', ig ? `https://www.instagram.com/${ig}/` : null)
  const web = datos.web?.trim()
  completar('web', web && !/instagram\.com/i.test(web) ? (/^https?:\/\//i.test(web) ? web : `https://${web}`) : null)
  completar('rubro', datos.rubro)
  completar('industria', datos.industria)
  if (Object.keys(faltantes).length) {
    const { error } = await db.from('prospectos').update(faltantes).eq('id', p.id)
    if (error) console.error('No se pudieron completar los datos del cliente:', error.message)
  }
  return { id: p.id, creado }
}

// ---------------------------------------------------------------------------

export interface ContextoIntervencion {
  fecha: string
  titulo: string
  segmentos: Segmento[] | null
  texto: string | null
  urls: string[]
  servicios: ServicioCatalogo[]
  prospecto: { nombre: string; empresa: string | null; rubro: string | null; etapa: string; notas: string | null } | null
}

/** Arma el material para Claude (exportada para tests). */
export async function armarMaterial(ctx: ContextoIntervencion, fetcher: typeof fetch = fetch): Promise<string> {
  const links = await Promise.all(ctx.urls.slice(0, MAX_URLS).map((u) => leerUrl(u, fetcher)))
  const audio = (ctx.segmentos ?? []).map((s) => s.texto).join('\n').trim()
  // Si el texto pegado es el mismo que la "transcripción" (intervención de solo texto), va una sola vez
  const texto = ctx.texto?.trim() && ctx.texto.trim() !== audio ? ctx.texto.trim() : ''
  const p = ctx.prospecto
  const catalogo = ctx.servicios
    .map((s) => `- id: ${s.id} | ${s.nombre}${s.descripcion ? ` — ${s.descripcion}` : ''}`)
    .join('\n')
  return `<intervencion>
Fecha: ${ctx.fecha}
Título: ${ctx.titulo}
Cliente ya identificado: ${p ? `${p.empresa ? `${p.empresa} (contacto: ${p.nombre})` : p.nombre}. Rubro: ${p.rubro ?? 'sin dato'}. Etapa: ${p.etapa}.${p.notas ? ` Notas: ${p.notas}` : ''}` : 'no (deducilo del material)'}
</intervencion>

${audio ? `<audio_transcripto>\n${audio}\n</audio_transcripto>\n\n` : ''}${texto ? `<texto>\n${texto}\n</texto>\n\n` : ''}${links.length ? `<links>\n${links.join('\n\n')}\n</links>\n\n` : ''}<catalogo_de_servicios>
${catalogo || '(el catálogo está vacío)'}
</catalogo_de_servicios>`
}

export async function analizarIntervencion(ctx: ContextoIntervencion): Promise<{ analisis: Record<string, unknown>; modelo: string }> {
  const material = await armarMaterial(ctx)
  const client = new Anthropic() // lee ANTHROPIC_API_KEY
  const response = await client.beta.messages.create({
    model: MODELO,
    max_tokens: 8000,
    // Si el modelo rechaza el pedido, la API lo reintenta sola con un modelo de respaldo.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: ESQUEMA_INTERVENCION } },
    system: SISTEMA,
    messages: [{ role: 'user', content: material }],
  })
  if (response.stop_reason === 'refusal') throw new Error('Claude no pudo analizar esta intervención (rechazo de seguridad).')
  if (response.stop_reason === 'max_tokens') throw new Error('El análisis quedó incompleto (respuesta demasiado larga).')
  const bloque = response.content.find((b) => b.type === 'text')
  if (!bloque || bloque.type !== 'text') throw new Error('Claude no devolvió texto.')
  return { analisis: { tipo: 'intervencion', ...JSON.parse(bloque.text) }, modelo: response.model }
}
