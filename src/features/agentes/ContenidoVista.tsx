import { useState } from 'react'
import { Check, Copy, ExternalLink } from 'lucide-react'
import type { CuentaCompetencia, EstrategiaContenido } from '../../types/db'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'

const num = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('es-AR'))

/** El formato que más interacción le da a una cuenta */
function formatoFuerte(c: CuentaCompetencia) {
  const f = Object.entries(c.interaccion_por_formato ?? {}).sort((a, b) => b[1] - a[1])[0]
  return f ? f[0] : '—'
}

function Titulo({ children }: { children: string }) {
  return <h3 className="mb-2 text-xs font-bold tracking-[0.14em] text-tenue uppercase">{children}</h3>
}

function CopiarTexto({ texto, etiqueta = 'Copiar caption' }: { texto: string; etiqueta?: string }) {
  const [hecho, setHecho] = useState(false)
  return (
    <Button
      size="sm"
      variant="fantasma"
      className="-ml-2"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto)
          setHecho(true)
          window.setTimeout(() => setHecho(false), 2000)
        } catch {
          /* sin permiso de portapapeles */
        }
      }}
    >
      {hecho ? <Check className="size-4" /> : <Copy className="size-4" />} {hecho ? 'Copiado' : etiqueta}
    </Button>
  )
}

/** Un @usuario o un link: lo deja tocable */
function Referencia({ texto }: { texto: string }) {
  const link = /^https?:\/\//.test(texto) ? texto : /^@?[a-z0-9._]{2,30}$/i.test(texto.trim()) ? `https://www.instagram.com/${texto.trim().replace(/^@/, '')}/` : null
  if (!link) return <span>{texto}</span>
  return (
    <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-acento-texto hover:underline">
      {/^https?:/.test(texto) ? 'ver publicación' : `@${texto.trim().replace(/^@/, '')}`} <ExternalLink className="size-3" />
    </a>
  )
}

/**
 * Resultado del agente "Competencia y contenido": la comparación con números reales (API de Meta), lo que les
 * funciona a los referentes, las brechas, las 8 publicaciones listas para hacer y el calendario.
 */
export function ContenidoVista({ cuentas, e }: { cuentas: CuentaCompetencia[]; e: EstrategiaContenido }) {
  const leidas = cuentas.filter((c) => !c.error).sort((a, b) => Number(b.es_cliente) - Number(a.es_cliente) || (b.seguidores ?? 0) - (a.seguidores ?? 0))
  const fallidas = cuentas.filter((c) => c.error)
  return (
    <div className="flex flex-col gap-6">
      {leidas.length > 0 && (
        <div>
          <Titulo>Comparación · datos de la API de Meta</Titulo>
          <div className="overflow-x-auto rounded-xl border border-borde">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs text-tenue">
                  <th className="px-3 py-2 font-semibold">Cuenta</th>
                  <th className="px-3 py-2 text-right font-semibold">Seguidores</th>
                  <th className="px-3 py-2 text-right font-semibold">Interacción</th>
                  <th className="px-3 py-2 text-right font-semibold">Publica</th>
                  <th className="px-3 py-2 font-semibold">Le rinde</th>
                </tr>
              </thead>
              <tbody>
                {leidas.map((c) => (
                  <tr key={c.usuario} className={`border-t border-borde ${c.es_cliente ? 'bg-acento-tenue/40' : ''}`}>
                    <td className="px-3 py-2">
                      <Referencia texto={c.usuario} /> {c.es_cliente && <Badge tono="acento">cliente</Badge>}
                    </td>
                    <td className="tabular px-3 py-2 text-right">{num(c.seguidores)}</td>
                    <td className="tabular px-3 py-2 text-right">{c.interaccion_pct != null ? `${c.interaccion_pct.toLocaleString('es-AR')}%` : '—'}</td>
                    <td className="tabular px-3 py-2 text-right">{c.por_semana != null ? `${c.por_semana.toLocaleString('es-AR')}/sem.` : '—'}</td>
                    <td className="px-3 py-2">{formatoFuerte(c)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {fallidas.length > 0 && (
            <p className="mt-1.5 text-xs text-tenue">No se pudieron leer: {fallidas.map((c) => `@${c.usuario}`).join(', ')} (cuentas personales o inexistentes).</p>
          )}
        </div>
      )}

      {e.que_les_funciona.length > 0 && (
        <div>
          <Titulo>Lo que les funciona</Titulo>
          <ul className="flex flex-col gap-2 text-[15px]">
            {e.que_les_funciona.map((x, i) => (
              <li key={i} className="rounded-xl bg-elevada p-3 leading-snug">
                <Referencia texto={x.usuario} /> · {x.que}
                {x.ejemplo && <span className="mt-1 block text-sm text-tenue">{x.ejemplo}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {e.brechas.length > 0 && (
        <div>
          <Titulo>Lo que hacen ellos y el cliente no</Titulo>
          <ul className="flex flex-col gap-2 text-[15px]">
            {e.brechas.map((x, i) => (
              <li key={i} className="rounded-xl bg-elevada p-3 leading-snug">
                <span className="font-semibold">{x.que_hacen_ellos}</span>
                <span className="mt-1 block text-sm text-tenue">Hoy: {x.que_hace_el_cliente}</span>
                <span className="mt-1 block text-sm text-acento-texto">→ {x.oportunidad}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {e.tendencias.length > 0 && (
        <div>
          <Titulo>Tendencias del rubro</Titulo>
          <ul className="flex flex-col gap-1.5 text-[15px]">
            {e.tendencias.map((x, i) => (
              <li key={i}>
                <b className="font-semibold">{x.titulo}:</b> <span className="text-suave">{x.detalle}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {e.ideas.length > 0 && (
        <div>
          <Titulo>Publicaciones para hacer</Titulo>
          <div className="grid gap-3 sm:grid-cols-2">
            {e.ideas.map((x, i) => (
              <article key={i} className="flex flex-col rounded-xl border border-borde bg-superficie p-3.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tono="acento">{x.formato}</Badge>
                  <Badge>{x.pilar}</Badge>
                </div>
                <h4 className="mt-2 font-semibold leading-snug">
                  {i + 1}. {x.titulo}
                </h4>
                <p className="mt-1 text-sm text-suave">
                  <span className="text-tenue">Gancho:</span> "{x.gancho}"
                </p>
                {x.guion.length > 0 && (
                  <ol className="mt-2 flex list-decimal flex-col gap-0.5 pl-5 text-sm text-suave">
                    {x.guion.map((g, k) => (
                      <li key={k}>{g}</li>
                    ))}
                  </ol>
                )}
                <div className="mt-2 rounded-lg bg-elevada p-2.5 text-sm whitespace-pre-line">{x.caption}</div>
                <p className="mt-1.5 text-xs text-tenue">{x.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}</p>
                <p className="mt-1.5 text-sm">
                  <span className="text-tenue">CTA:</span> {x.cta}
                </p>
                <p className="mt-1 text-sm text-tenue">
                  Inspirado en <Referencia texto={x.inspirado_en} /> · {x.por_que}
                </p>
                <div className="mt-auto pt-1">
                  <CopiarTexto texto={`${x.caption}\n\n${x.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}`} />
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {e.calendario.length > 0 && (
        <div>
          <Titulo>Calendario · próximas 2 semanas</Titulo>
          <ul className="flex flex-col divide-y divide-borde rounded-xl border border-borde text-sm">
            {e.calendario.map((x, i) => (
              <li key={i} className="flex gap-3 px-3 py-2">
                <span className="w-28 shrink-0 font-semibold">{x.dia}</span>
                <span className="text-suave">{x.idea}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {e.recomendaciones.length > 0 && (
        <div>
          <Titulo>Cambios de fondo</Titulo>
          <ul className="flex flex-col gap-1 text-[15px] text-suave">
            {e.recomendaciones.map((x, i) => (
              <li key={i}>· {x}</li>
            ))}
          </ul>
        </div>
      )}

      {e.que_ofrecerle && (
        <div className="rounded-xl border border-acento/40 bg-acento-tenue/40 p-3.5 text-[15px]">
          <span className="font-semibold">Qué le ofrecemos: </span>
          {e.que_ofrecerle}
        </div>
      )}
    </div>
  )
}
