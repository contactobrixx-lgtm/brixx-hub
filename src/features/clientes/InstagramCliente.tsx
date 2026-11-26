import { AtSign, ExternalLink, RefreshCw } from 'lucide-react'
import type { Prospecto } from '../../types/db'
import { Button } from '../../components/ui/Button'
import { ErrorBox } from '../../components/ui/ErrorBox'
import { useInstagram } from './useInstagram'

const num = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('es-AR'))

/** Una métrica con su valor y una aclaración chica */
function Dato({ label, valor, nota }: { label: string; valor: string; nota?: string | null }) {
  return (
    <div className="rounded-xl bg-elevada px-3 py-2.5">
      <div className="text-xs text-tenue">{label}</div>
      <div className="tabular mt-0.5 text-lg leading-tight font-bold">{valor}</div>
      {nota && <div className="mt-0.5 text-xs text-tenue">{nota}</div>}
    </div>
  )
}

/** Qué tan buena es la interacción para un comercio chico (misma referencia que usa Claude) */
const nivelInteraccion = (pct: number | null) => (pct == null ? null : pct >= 3 ? 'Buena' : pct >= 1 ? 'Normal' : pct >= 0.5 ? 'Algo baja' : 'Baja')

/**
 * Bloque "Instagram" de la carpeta: datos reales de la cuenta del cliente por la API de Meta (seguidores,
 * frecuencia, interacción, formatos y mejores publicaciones), guardados cada vez que se actualiza para ver
 * cómo evoluciona. Solo cuentas de empresa o creador.
 */
export function InstagramCliente({ p }: { p: Prospecto }) {
  const { ultima, anterior, cargando, actualizando, error, sinMeta, actualizar, diagnostico, diagnosticar } = useInstagram(p.id)
  const d = ultima?.datos
  const m = ultima?.metricas
  const cambio = ultima && anterior ? ultima.datos.seguidores - anterior.datos.seguidores : null

  return (
    <section className="rounded-2xl border border-borde bg-superficie p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <AtSign className="size-5 text-acento-texto" />
        <h2 className="min-w-0 flex-1 text-[19px] font-bold">Instagram</h2>
        {p.instagram && (
          <Button size="sm" variant="secundario" onClick={actualizar} disabled={actualizando}>
            <RefreshCw className={`size-4 ${actualizando ? 'animate-spin' : ''}`} /> {ultima ? 'Actualizar' : 'Leer con Meta'}
          </Button>
        )}
      </div>

      {!p.instagram ? (
        <p className="text-sm text-tenue">Cargá su Instagram en los datos de la carpeta para leer sus números con la API de Meta.</p>
      ) : cargando ? null : !ultima ? (
        <p className="text-sm text-tenue">
          Todavía no lo leímos. "Leer con Meta" trae los datos reales de la cuenta: seguidores, cada cuánto publica, cuánta interacción tiene
          y qué publicaciones funcionan mejor.
        </p>
      ) : (
        d &&
        m && (
          <>
            <a
              href={`https://www.instagram.com/${d.usuario}/`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm font-semibold text-acento-texto hover:underline"
            >
              @{d.usuario} <ExternalLink className="size-3.5" />
            </a>
            {d.biografia && <p className="mt-1 line-clamp-2 text-sm text-suave">{d.biografia}</p>}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Dato
                label="Seguidores"
                valor={num(d.seguidores)}
                nota={cambio != null ? `${cambio >= 0 ? '+' : ''}${cambio.toLocaleString('es-AR')} desde la vez anterior` : null}
              />
              <Dato label="Interacción" valor={m.interaccion_pct != null ? `${m.interaccion_pct.toLocaleString('es-AR')}%` : '—'} nota={nivelInteraccion(m.interaccion_pct)} />
              <Dato label="Publica" valor={m.por_semana != null ? `${m.por_semana.toLocaleString('es-AR')} / sem.` : '—'} nota={m.dias_desde_ultima != null ? `La última hace ${m.dias_desde_ultima} días` : null} />
              <Dato label="Promedio" valor={`${num(m.promedio_me_gusta)} ♥`} nota={m.promedio_comentarios != null ? `${m.promedio_comentarios.toLocaleString('es-AR')} comentarios` : null} />
            </div>
            {Object.keys(m.formatos).length > 0 && (
              <p className="mt-3 text-sm text-suave">
                <span className="text-tenue">Formatos: </span>
                {Object.entries(m.formatos)
                  .sort((a, b) => (m.interaccion_por_formato[b[0]] ?? 0) - (m.interaccion_por_formato[a[0]] ?? 0))
                  .map(([t, n]) => `${t} ${n} (${num(m.interaccion_por_formato[t])} interacc.)`)
                  .join(' · ')}
              </p>
            )}
            {m.mejores.length > 0 && (
              <div className="mt-3">
                <div className="mb-1.5 text-xs font-semibold text-tenue">Lo que mejor le funciona</div>
                <ul className="flex flex-col gap-1.5">
                  {m.mejores.map((x, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="tabular shrink-0 font-semibold">{num(x.interaccion)}</span>
                      <span className="min-w-0 flex-1 truncate text-suave">
                        {x.tipo} · {x.texto || 'sin texto'}
                      </span>
                      {x.link && (
                        <a href={x.link} target="_blank" rel="noreferrer" className="shrink-0 text-acento-texto" aria-label="Ver publicación">
                          <ExternalLink className="size-3.5" />
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="mt-3 text-xs text-tenue">
              Datos de la API de Meta del {new Date(ultima.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} · últimas{' '}
              {m.analizadas} publicaciones. Para el diagnóstico completo, corré el agente Auditor.
            </p>
          </>
        )
      )}
      {error && (
        <div className="mt-3">
          <ErrorBox mensaje={sinMeta ? 'Falta conectar la API de Meta al hub (los pasos te los paso por el chat).' : error} />
          {!sinMeta && !diagnostico && (
            <Button size="sm" variant="fantasma" className="-ml-2 mt-1" onClick={() => diagnosticar(p.instagram)}>
              Ver diagnóstico de la conexión
            </Button>
          )}
        </div>
      )}
      {diagnostico && (
        <pre className="mt-3 overflow-x-auto rounded-xl bg-elevada p-3 text-xs leading-relaxed whitespace-pre-wrap text-suave">{diagnostico.join('\n')}</pre>
      )}
    </section>
  )
}
