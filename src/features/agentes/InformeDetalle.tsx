import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Calculator, Check, Copy, FolderOpen, Megaphone, MessageCircle, Printer, Trash2 } from 'lucide-react'
import type { ClientePostventa, InformeAgente, MensajeAgente } from '../../types/db'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { ErrorBox } from '../../components/ui/ErrorBox'
import { Spinner } from '../../components/ui/Spinner'
import { DESCRIPCION } from './catalogo'
import { colgado, linkWhatsApp } from './useAgentes'

function Copiar({ texto }: { texto: string }) {
  const [hecho, setHecho] = useState(false)
  return (
    <Button
      size="sm"
      variant="secundario"
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
      {hecho ? <Check className="size-4" /> : <Copy className="size-4" />} {hecho ? 'Copiado' : 'Copiar'}
    </Button>
  )
}

/** Un mensaje redactado por un agente, para copiar o abrir en WhatsApp (lo manda el socio). */
function Mensaje({
  cliente,
  prospectoId,
  telefono,
  encabezado,
  texto,
}: {
  cliente: string
  prospectoId: string
  telefono: string | null
  encabezado?: ReactNode
  texto: string
}) {
  return (
    <div className="rounded-xl border border-borde bg-superficie p-3.5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Link to={`/clientes/${prospectoId}`} className="font-semibold hover:underline">
          {cliente}
        </Link>
        {encabezado}
      </div>
      <p className="rounded-lg bg-elevada px-3 py-2.5 text-sm leading-relaxed whitespace-pre-line text-suave">{texto}</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <Copiar texto={texto} />
        {telefono && (
          <a href={linkWhatsApp(telefono, texto)} target="_blank" rel="noreferrer">
            <Button size="sm" variant="secundario">
              <MessageCircle className="size-4" /> Abrir en WhatsApp
            </Button>
          </a>
        )}
      </div>
    </div>
  )
}

const SALUD = {
  riesgo: { tono: 'peligro', label: 'En riesgo' },
  atencion: { tono: 'aviso', label: 'Atención' },
  bien: { tono: 'ok', label: 'Bien' },
} as const

interface Props {
  informe: InformeAgente | null
  onCerrar: () => void
  onBorrar: (id: string) => Promise<void>
}

/** El informe completo de un agente, en la hoja lateral. */
export function InformeDetalle({ informe, onCerrar, onBorrar }: Props) {
  const [borrando, setBorrando] = useState(false)
  if (!informe) return null
  const desc = DESCRIPCION[informe.agente]
  const mensajes: MensajeAgente[] = informe.datos?.mensajes ?? []
  const clientes: ClientePostventa[] = informe.datos?.clientes ?? []

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={informe.estado === 'trabajando' ? `${desc?.nombre ?? 'Agente'}: trabajando…` : informe.titulo}
      pie={
        <div className="flex w-full items-center justify-between gap-2">
          <Button
            variant="peligro"
            disabled={borrando}
            onClick={async () => {
              setBorrando(true)
              try {
                await onBorrar(informe.id)
                onCerrar()
              } finally {
                setBorrando(false)
              }
            }}
          >
            <Trash2 className="size-4" /> Borrar
          </Button>
          <Button variant="secundario" onClick={onCerrar}>
            Cerrar
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-tenue">
          {desc?.nombre} · {new Date(informe.created_at).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short', hour12: false })}
          {informe.pedido_por ? ' · pedido a mano' : ' · solo'}
        </p>

        {colgado(informe) && <ErrorBox mensaje="Este agente se cortó antes de terminar (tardó demasiado). Borralo y volvé a correrlo." />}
        {informe.estado === 'trabajando' && !colgado(informe) && (
          <div className="flex items-center gap-2.5 rounded-xl bg-acento-tenue/60 px-3.5 py-3 text-sm text-acento-texto">
            <Spinner className="size-4" /> Trabajando: puede tardar {informe.agente === 'meta_ads' ? 'unos 3 minutos' : 'un par de minutos'}. Podés cerrar esto,
            el informe queda guardado.
          </div>
        )}
        {informe.estado === 'error' && <ErrorBox mensaje={`No pudo terminar: ${informe.error ?? 'error desconocido'}`} />}

        {informe.resumen && <p className="text-[17px] leading-snug font-semibold">{informe.resumen}</p>}

        {clientes.length > 0 && (
          <div className="flex flex-col gap-3">
            {clientes.map((c) => (
              <div key={c.prospecto_id} className="flex flex-col gap-2">
                <Mensaje
                  cliente={c.cliente}
                  prospectoId={c.prospecto_id}
                  telefono={c.telefono}
                  encabezado={<Badge tono={SALUD[c.salud]?.tono ?? 'neutro'}>{SALUD[c.salud]?.label ?? c.salud}</Badge>}
                  texto={c.mensaje}
                />
                <ul className="-mt-1 ml-3.5 flex flex-col gap-0.5 text-sm text-suave">
                  <li>· {c.motivo}</li>
                  {!/^ninguna/i.test(c.oportunidad) && <li>· Oportunidad: {c.oportunidad}</li>}
                </ul>
              </div>
            ))}
          </div>
        )}

        {informe.datos?.campana && (
          <Link to={`/informes/${informe.id}/campana`} target="_blank" className="block">
            <div className="flex items-center gap-3 rounded-xl border border-acento/40 bg-acento-tenue/50 p-4 transition-colors hover:border-acento">
              <Megaphone className="size-6 shrink-0 text-acento-texto" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Abrir la propuesta de campaña</span>
                <span className="block text-sm text-tenue">3 páginas: números, cortes, plan y creativos. Editás precios y la guardás en PDF.</span>
              </span>
            </div>
          </Link>
        )}

        {informe.datos?.cotizacion_id && (
          <div className="flex flex-wrap gap-2">
            <Link to={`/cotizador?abrir=${informe.datos.cotizacion_id}`}>
              <Button size="sm">
                <Calculator className="size-4" /> Revisar {informe.datos.numero ?? 'la cotización'} en el cotizador
              </Button>
            </Link>
            <Link to={`/cotizaciones/${informe.datos.cotizacion_id}/imprimir`} target="_blank">
              <Button size="sm" variant="secundario">
                <Printer className="size-4" /> Versión para imprimir
              </Button>
            </Link>
          </div>
        )}

        {informe.contenido && informe.agente !== 'cobranzas' && informe.agente !== 'postventa' && (
          <div className="rounded-xl border border-borde bg-superficie p-4 text-[15px] leading-relaxed whitespace-pre-line text-suave">{informe.contenido}</div>
        )}

        {mensajes.length > 0 && (
          <div className="flex flex-col gap-3">
            {mensajes.map((m, i) => (
              <Mensaje
                key={`${m.prospecto_id}-${m.tipo}-${i}`}
                cliente={m.cliente}
                prospectoId={m.prospecto_id}
                telefono={m.telefono}
                encabezado={m.detalle ? <span className="text-sm text-tenue">{m.detalle}</span> : undefined}
                texto={m.texto}
              />
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {informe.contenido && <Copiar texto={`${informe.titulo}\n\n${informe.resumen ? `${informe.resumen}\n\n` : ''}${informe.contenido}`} />}
          {informe.prospecto_id && (
            <Link to={`/clientes/${informe.prospecto_id}`}>
              <Button size="sm" variant="secundario">
                <FolderOpen className="size-4" /> Carpeta del cliente
              </Button>
            </Link>
          )}
        </div>
        {(mensajes.length > 0 || clientes.length > 0) && (
          <p className="text-xs text-tenue">Los mensajes no se mandan solos: los copiás o los abrís en WhatsApp y los mandás vos.</p>
        )}
      </div>
    </Modal>
  )
}
