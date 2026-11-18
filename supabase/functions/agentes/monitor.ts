// Agente "monitor": revisa que respondan las URLs de los sistemas entregados y las demos web.
// No usa IA. Guarda el estado en cada ficha y deja un informe solo cuando algo se cae o vuelve.
import { empezarInforme, marcarCorrida, terminarInforme, type Contexto, type Fila } from './comun.ts'

const TIMEOUT_MS = 10_000

async function chequear(url: string): Promise<{ ok: boolean; detalle: string }> {
  const inicio = Date.now()
  try {
    const r = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; brixx-monitor/1.0)', accept: 'text/html,*/*' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    await r.body?.cancel().catch(() => {})
    const seg = ((Date.now() - inicio) / 1000).toFixed(1).replace('.', ',')
    // 401/403: el sitio está, solo que pide login o no deja entrar a robots
    const ok = r.status < 400 || r.status === 401 || r.status === 403 || r.status === 405 || r.status === 429
    return { ok, detalle: ok ? `Responde (${r.status}) en ${seg} s` : `Error ${r.status}` }
  } catch (e) {
    const timeout = e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError')
    return { ok: false, detalle: timeout ? `No responde (más de ${TIMEOUT_MS / 1000} s)` : 'No se pudo conectar' }
  }
}

/** Revisa todas las fichas (menos las archivadas). Devuelve un resumen corto. */
export async function correrMonitor(ctx: Contexto): Promise<string> {
  const { data: fichas, error } = await ctx.db.from('fichas').select('id, nombre, seccion, url, cliente, estado, en_linea').neq('estado', 'archivado')
  if (error) throw new Error(error.message)
  const lista = (fichas ?? []).filter((f) => /^https?:\/\//i.test(String(f.url ?? '')))

  const resultados = await Promise.all(
    lista.map(async (f: Fila) => {
      let r = await chequear(String(f.url))
      if (!r.ok) {
        // Un segundo intento antes de dar la alarma (evita falsas caídas)
        await new Promise((ok) => setTimeout(ok, 3000))
        r = await chequear(String(f.url))
      }
      await ctx.db.from('fichas').update({ en_linea: r.ok, chequeo_at: new Date().toISOString(), chequeo_detalle: r.detalle }).eq('id', f.id)
      return { f, ...r }
    }),
  )

  const cayeron = resultados.filter((r) => !r.ok && r.f.en_linea !== false)
  const volvieron = resultados.filter((r) => r.ok && r.f.en_linea === false)
  const hora = new Date().toISOString().slice(0, 13)
  const tipo = (f: Fila) => (f.seccion === 'demo' ? 'la demo' : 'el sistema')

  for (const r of cayeron) {
    const id = await empezarInforme(ctx, 'monitor', `monitor:caida:${r.f.id}:${hora}`, { titulo: `Se cayó ${r.f.nombre}` })
    if (id)
      await terminarInforme(ctx, id, {
        titulo: `Se cayó ${r.f.nombre}`,
        resumen: `${r.f.seccion === 'demo' ? 'La demo' : 'El sistema'} ${r.f.nombre}${r.f.cliente ? ` de ${r.f.cliente}` : ''} no responde: ${r.detalle.toLowerCase()}.`,
        contenido: `QUÉ PASA\n- ${r.f.url}\n- ${r.detalle}\n\nQUÉ HACER\n- Abrilo vos para confirmar.\n- Revisá el hosting o el dominio (vencimiento, DNS, plan).\n- Si es de un cliente, avisale antes de que se entere solo.`,
        datos: { ficha_id: r.f.id, url: r.f.url, detalle: r.detalle },
      })
  }
  for (const r of volvieron) {
    const id = await empezarInforme(ctx, 'monitor', `monitor:volvio:${r.f.id}:${hora}`, { titulo: `Volvió ${r.f.nombre}` })
    if (id)
      await terminarInforme(ctx, id, {
        titulo: `Volvió ${r.f.nombre}`,
        resumen: `${tipo(r.f) === 'la demo' ? 'La demo' : 'El sistema'} ${r.f.nombre} volvió a responder.`,
        contenido: `- ${r.f.url}\n- ${r.detalle}`,
        datos: { ficha_id: r.f.id, url: r.f.url, detalle: r.detalle },
      })
  }

  const caidas = resultados.filter((r) => !r.ok)
  const resumen = !lista.length
    ? 'No hay sistemas ni demos con URL para revisar.'
    : caidas.length
      ? `${caidas.length} de ${lista.length} no responden: ${caidas.map((r) => r.f.nombre).join(', ')}.`
      : `Los ${lista.length} sistemas y demos responden bien.`
  await marcarCorrida(ctx, 'monitor', resumen)
  return resumen
}
