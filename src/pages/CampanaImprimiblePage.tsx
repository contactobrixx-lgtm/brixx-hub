import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { Printer } from 'lucide-react'
import type { CampanaMeta, ProductoMeta } from '../types/db'
import { supabase } from '../lib/supabase'
import { Button } from '../components/ui/Button'
import { PantallaCarga } from '../components/ui/Spinner'
import '../features/agentes/campana.css'

/**
 * Propuesta de campaña de Meta Ads (la arma el agente meta_ads), con el diseño del PDF del skill
 * campanas-meta-ads: A4 horizontal, 3 páginas. Los precios, las promos y los valores del header son
 * editables; un mismo campo cambia en todo el documento. Se imprime o se guarda como PDF desde el navegador.
 */

type Valores = Record<string, string>
const CamposCtx = createContext<{ valores: Valores; cambiar: (n: string, v: string) => void }>({ valores: {}, cambiar: () => {} })

/** Un valor editable (input). Mismo nombre = mismo valor en todo el documento. */
function Campo({ nombre, className }: { nombre: string; className?: string }) {
  const { valores, cambiar } = useContext(CamposCtx)
  const v = valores[nombre] ?? ''
  return (
    <input
      className={`edit ${className ?? ''}`}
      value={v}
      size={Math.max(2, v.length)}
      onChange={(e) => cambiar(nombre, e.target.value)}
      aria-label={nombre.replace(/_/g, ' ')}
    />
  )
}

/** Texto con {promo}, {venta} o {campo} adentro: esas partes son editables. */
function Plantilla({ texto, p }: { texto: string; p?: ProductoMeta }) {
  const partes: ReactNode[] = []
  const re = /\{(\w+)\}/g
  let ultimo = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(texto))) {
    if (m.index > ultimo) partes.push(texto.slice(ultimo, m.index))
    const k = m[1]
    const nombre = p && (k === 'promo' || k === 'venta') ? `${k}_${p.key}` : k
    partes.push(<Campo key={`${m.index}-${k}`} nombre={nombre} />)
    ultimo = m.index + m[0].length
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo))
  return <>{partes}</>
}

function Logo({ pt, oscuro }: { pt: number; oscuro: boolean }) {
  return (
    <span className="logo" style={{ fontSize: `${pt}pt`, color: oscuro ? 'var(--color-papel)' : 'var(--color-tinta)' }}>
      <svg viewBox="0 0 40 40" aria-hidden>
        <rect x="22" y="0" width="18" height="18" rx="4.5" fill={oscuro ? 'var(--color-papel)' : 'var(--color-tinta)'} />
        <rect x="0" y="22" width="18" height="18" rx="4.5" fill="var(--color-acento)" />
        <rect x="22" y="22" width="18" height="18" rx="4.5" fill="var(--color-acento-claro)" />
      </svg>
      brixx
    </span>
  )
}

function SinImagen({ p, className }: { p: ProductoMeta; className?: string }) {
  return <div className={`noimg ${className ?? ''}`}>{p.nombre}</div>
}

function Pie({ c, n, total }: { c: CampanaMeta; n: number; total: number }) {
  return (
    <div className="foot">
      <span>
        <Logo pt={9} oscuro={false} /> &nbsp;·&nbsp; Propuesta para {c.cliente} · {c.fecha}
      </span>
      <span>
        {c.contacto} &nbsp;·&nbsp; {n} / {total}
      </span>
    </div>
  )
}

function Pagina1({ c, total }: { c: CampanaMeta; total: number }) {
  return (
    <section className="page">
      <div className="hero">
        <div className="top">
          <Logo pt={17} oscuro />
          <span>
            Propuesta para {c.cliente} · {c.fecha}
          </span>
        </div>
        <h1 className="D">
          {c.titulo} <span>· {c.subtitulo}</span>
        </h1>
        <div className="kpis">
          {c.kpis.slice(0, 6).map((k) => (
            <div key={k.label} className="kpi">
              <small>{k.label}</small>
              <b className="D">
                <Plantilla texto={k.valor} />
              </b>
              <em>
                <Plantilla texto={k.nota} />
              </em>
            </div>
          ))}
        </div>
      </div>
      <div className="grid1">
        <div>
          <div className="eyebrow">Productos y precios</div>
          <h2 className="D">{c.productos_titulo}</h2>
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th className="r">Costo</th>
                <th className="r">Precio</th>
                <th>{c.columna_promo}</th>
                <th className="r">CPA equil.</th>
                <th className="r">{c.columna_evento}</th>
                <th className="r">CPC máx.</th>
                <th className="r">CPM máx.</th>
              </tr>
            </thead>
            <tbody>
              {c.productos.map((p) => (
                <tr key={p.key}>
                  <td>
                    <div className="prod">
                      <SinImagen p={p} />
                      <div>
                        <b>{p.nombre}</b>
                        <small>{p.codigo}</small>
                      </div>
                    </div>
                  </td>
                  <td className="r">{p.costo}</td>
                  <td className="r">
                    <Campo nombre={`venta_${p.key}`} />
                  </td>
                  <td>
                    <small style={{ color: 'var(--muted)' }}>{p.promo_label}</small> <Campo nombre={`promo_${p.key}`} />
                  </td>
                  <td className="r">{p.cpa}</td>
                  <td className="r">{p.max_evento}</td>
                  <td className="r">{p.cpc}</td>
                  <td className="r">{p.cpm}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="note">{c.nota_productos}</p>
        </div>
        <div>
          <div className="eyebrow">Cómo se decide</div>
          <h2 className="D">Cortes a las 48–72 h</h2>
          <table className="cut">
            <thead>
              <tr>
                <th>Métrica</th>
                <th>Seguir</th>
                <th>Cortar</th>
              </tr>
            </thead>
            <tbody>
              {c.cortes.map(([a, b, x]) => (
                <tr key={a}>
                  <td>{a}</td>
                  <td className="ok">{b}</td>
                  <td className="bad">{x}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="note">{c.nota_cortes}</p>
        </div>
      </div>
      <div className="steps">
        {c.pasos.slice(0, 4).map(([t, x], i) => (
          <div key={t} className="step">
            <b className="D">
              <i>{String(i + 1).padStart(2, '0')}</i>
              {t}
            </b>
            <span>{x}</span>
          </div>
        ))}
      </div>
      <Pie c={c} n={1} total={total} />
    </section>
  )
}

function Fila({ c, p }: { c: CampanaMeta; p: ProductoMeta }) {
  return (
    <div className="row">
      <div className="info">
        <SinImagen p={p} className="pic" />
        <h3 className="D">{p.nombre}</h3>
        <small>{p.codigo}</small>
        <div className="pr">
          <span>Precio</span>
          <Campo nombre={`venta_${p.key}`} />
        </div>
        <div className="pr st">
          <span>Promo · {p.promo_label}</span>
          <Campo nombre={`promo_${p.key}`} />
        </div>
        <small>CPA equilibrio {p.cpa}</small>
      </div>
      {p.angulos.slice(0, 3).map((a, i) => {
        const video = a.tipo === 'video'
        return (
          <div key={i} className="ang">
            <div className="mock" style={{ ['--bg' as string]: a.bg }}>
              <div className="ov D">
                <Plantilla texto={a.overlay} p={p} />
              </div>
              <div className="card">
                <SinImagen p={p} />
                {a.pack && <SinImagen p={p} />}
              </div>
              {video && <div className="play" />}
              <div className="cta">{c.cta}</div>
              <div className="fmt">{video ? 'VIDEO 9:16 · 4:5' : 'IMAGEN 1:1 · 9:16'}</div>
            </div>
            <div className="copy">
              <div className="an">
                <b className="D">
                  Ángulo {i + 1} · {a.nombre}
                </b>
                <span className={`chip ${video ? 'v' : 'i'}`}>{video ? 'VIDEO' : 'IMAGEN'}</span>
              </div>
              <div className="lbl">Texto principal</div>
              <div className="pt">
                <Plantilla texto={a.texto} p={p} />
              </div>
              <div className="lbl">Título</div>
              <div className="tt D">
                <Plantilla texto={a.titulo} p={p} />
              </div>
              <div className="br">{a.brief}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Cierre({ c }: { c: CampanaMeta }) {
  return (
    <div className={`next ${c.auditoria ? 'three' : ''}`}>
      <div className="box">
        <h3 className="D">Antes de lanzar</h3>
        <ul>
          {c.antes_de_lanzar.slice(0, 5).map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </div>
      <div className="box">
        <h3 className="D">Reglas de la promo</h3>
        <ul>
          {c.reglas.slice(0, 5).map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </div>
      {c.auditoria && (
        <div className="box aud">
          <h3 className="D">{c.auditoria.titulo}</h3>
          <ul>
            {c.auditoria.items.slice(0, 6).map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function PaginaCreativos({ c, productos, n, total, cierre }: { c: CampanaMeta; productos: ProductoMeta[]; n: number; total: number; cierre: boolean }) {
  return (
    <section className="page">
      <div className="ph">
        <div>
          <div className="eyebrow">Creativos por ángulo de venta</div>
          <h2 className="D">1 anuncio por producto con sus 3 ángulos (formato flexible)</h2>
          <div className="sub">
            Descripción en todos los anuncios: <b>{c.descripcion}</b>
          </div>
        </div>
        <div className="legend">
          <span>
            <span className="chip v">VIDEO</span> {c.leyenda_video}
          </span>
          <span>
            <span className="chip i">IMAGEN</span> {c.leyenda_imagen}
          </span>
        </div>
      </div>
      {productos.map((p) => (
        <Fila key={p.key} c={c} p={p} />
      ))}
      {cierre && <Cierre c={c} />}
      <Pie c={c} n={n} total={total} />
    </section>
  )
}

export function CampanaImprimiblePage() {
  const { id } = useParams()
  const [campana, setCampana] = useState<CampanaMeta | null>(null)
  const [cargando, setCargando] = useState(true)
  const [valores, setValores] = useState<Valores>({})

  useEffect(() => {
    if (!id) return
    supabase
      .from('agentes_informes')
      .select('datos')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        const c = (data?.datos as { campana?: CampanaMeta } | undefined)?.campana ?? null
        setCampana(c)
        if (c) {
          const v: Valores = { ...c.campos }
          for (const p of c.productos) {
            v[`venta_${p.key}`] = p.venta
            v[`promo_${p.key}`] = p.promo
          }
          setValores(v)
          document.title = `Campaña Meta Ads · ${c.cliente}`
        }
        setCargando(false)
      })
  }, [id])

  const ctx = useMemo(() => ({ valores, cambiar: (n: string, v: string) => setValores((x) => ({ ...x, [n]: v })) }), [valores])

  if (cargando) return <PantallaCarga />
  if (!campana) return <p className="p-10 text-center text-tenue">No se encontró la propuesta de campaña (¿el agente todavía está trabajando?).</p>

  // Hojas de creativos de a 3 productos; "Antes de lanzar" va en la última si entra (2 productos o menos en esa hoja)
  const grupos: ProductoMeta[][] = []
  for (let i = 0; i < campana.productos.length; i += 3) grupos.push(campana.productos.slice(i, i + 3))
  const cierreAparte = grupos[grupos.length - 1].length > 2
  const total = 1 + grupos.length + (cierreAparte ? 1 : 0)

  return (
    <div className="min-h-full overflow-x-auto bg-elevada py-6 print:bg-papel print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[297mm] flex-wrap items-center justify-between gap-3 px-4">
        <p className="text-sm text-tenue">Los valores con fondo azul se editan acá. Los techos (CPA, CPC, CPM) no se recalculan solos. La campaña se carga a mano en Meta.</p>
        <Button onClick={() => window.print()}>
          <Printer className="size-[18px]" /> Imprimir / guardar PDF
        </Button>
      </div>
      <CamposCtx.Provider value={ctx}>
        <div className="campana">
          <Pagina1 c={campana} total={total} />
          {grupos.map((g, i) => (
            <PaginaCreativos key={i} c={campana} productos={g} n={i + 2} total={total} cierre={!cierreAparte && i === grupos.length - 1} />
          ))}
          {cierreAparte && (
            <section className="page">
              <Cierre c={campana} />
              <Pie c={campana} n={total} total={total} />
            </section>
          )}
        </div>
      </CamposCtx.Provider>
    </div>
  )
}
