import { Link } from 'react-router-dom'
import { FileText, FolderPlus } from 'lucide-react'
import type { AnalisisIntervencion, Servicio } from '../../types/db'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { formatUSD, precioServicio } from '../../lib/format'
import { MensajeParaEnviar } from './MensajeParaEnviar'

function Bloque({ titulo, children, className = '' }: { titulo: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-borde bg-superficie p-4 sm:p-5 ${className}`}>
      <h2 className="mb-3 text-[19px] font-bold">{titulo}</h2>
      {children}
    </section>
  )
}

function Lista({ items, vacio }: { items: string[]; vacio: string }) {
  if (!items.length) return <p className="text-sm text-tenue">{vacio}</p>
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2 leading-snug text-suave">
          <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-tenue" aria-hidden />
          {t}
        </li>
      ))}
    </ul>
  )
}

interface Props {
  analisis: AnalisisIntervencion
  servicios: Servicio[]
  prospecto: { id: string; nombre: string; empresa: string | null; telefono: string | null; email: string | null } | null
  ocupado: boolean
  onCrearCotizacion: () => void
}

/** Análisis de una intervención, lo más resumido posible: qué le duele, qué lo frena, qué ofrecerle y qué mandarle. */
export function VistaIntervencion({ analisis: a, servicios, prospecto, ocupado, onCrearCotizacion }: Props) {
  const porId = new Map(servicios.map((s) => [s.id, s]))
  const delCatalogo = a.soluciones.filter((s) => s.servicio_id && porId.has(s.servicio_id))
  const totalImpl = delCatalogo.reduce((t, s) => t + Number(porId.get(s.servicio_id!)!.precio_implementacion || 0), 0)
  const totalMes = delCatalogo.reduce((t, s) => t + Number(porId.get(s.servicio_id!)!.precio_mensual || 0), 0)
  const nombre = prospecto ? prospecto.empresa || prospecto.nombre : null

  return (
    <div className="flex flex-col gap-4">
      {prospecto && (
        <Link
          to={`/clientes/${prospecto.id}`}
          className="flex items-center gap-3 rounded-2xl border border-borde bg-superficie p-3.5 transition-colors hover:border-borde-fuerte"
        >
          <FolderPlus className="size-5 shrink-0 text-acento-texto" />
          <span className="min-w-0 flex-1 text-sm">
            {a.carpeta_creada ? (
              <>
                <b>{nombre}</b> no estaba en Clientes: se creó su carpeta (y quedó en el pipeline, en Contacto).
              </>
            ) : (
              <>
                Quedó guardado en la carpeta de <b>{nombre}</b>.
              </>
            )}
          </span>
          <span className="text-sm font-semibold text-acento-texto">Ver carpeta</span>
        </Link>
      )}

      <Bloque titulo="Qué quiere">
        <p className="text-[17px] leading-relaxed font-semibold">{a.en_una_linea}</p>
      </Bloque>

      <div className="grid gap-4 md:grid-cols-2">
        <Bloque titulo="Dolores">
          <Lista items={a.dolores} vacio="No surgieron dolores claros." />
        </Bloque>
        <Bloque titulo="Cuellos de botella">
          <Lista items={a.cuellos_de_botella} vacio="No surgieron cuellos de botella." />
        </Bloque>
      </div>

      <Bloque titulo="Soluciones y servicios">
        <ul className="flex flex-col gap-2.5">
          {a.soluciones.map((s, i) => {
            const cat = s.servicio_id ? porId.get(s.servicio_id) : undefined
            return (
              <li key={i} className="rounded-xl bg-elevada p-3.5">
                <p className="leading-snug">{s.solucion}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <Badge tono={cat ? 'acento' : 'neutro'}>{cat?.nombre ?? s.servicio}</Badge>
                  {cat ? (
                    precioServicio(cat) && <span className="text-tenue">{precioServicio(cat)}</span>
                  ) : (
                    <span className="text-tenue">No está en el catálogo</span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
        {delCatalogo.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-borde pt-4">
            <span className="min-w-0 flex-1 text-sm text-suave">
              Total: <b className="text-texto">{formatUSD(totalImpl)}</b>
              {totalMes ? (
                <>
                  {' '}
                  + <b className="text-texto">{formatUSD(totalMes)}/mes</b>
                </>
              ) : null}
            </span>
            <Button size="sm" onClick={onCrearCotizacion} disabled={ocupado || !prospecto}>
              <FileText className="size-4" /> Armar cotización
            </Button>
          </div>
        )}
      </Bloque>

      <Bloque titulo="Propuesta para enviar">
        <p className="mb-2 text-sm text-tenue">
          Asunto: <span className="text-suave">{a.propuesta.asunto}</span>
        </p>
        <MensajeParaEnviar texto={a.propuesta.mensaje} telefono={prospecto?.telefono ?? null} email={prospecto?.email} asunto={a.propuesta.asunto} />
      </Bloque>

      {a.falta_saber.length > 0 && (
        <Bloque titulo="Falta saber">
          <Lista items={a.falta_saber} vacio="" />
        </Bloque>
      )}
    </div>
  )
}
