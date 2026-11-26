import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Megaphone, TrendingUp } from 'lucide-react'
import type { IdAgente, Prospecto } from '../../types/db'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Badge, Segmentado } from '../../components/ui/Badge'
import { Field, Input } from '../../components/ui/Field'
import { ErrorBox } from '../../components/ui/ErrorBox'
import { Spinner } from '../../components/ui/Spinner'
import { cn } from '../../components/ui/cn'
import { parseNumero } from '../../lib/format'
import { AGENTES, DESCRIPCION } from './catalogo'
import { colgado, correrAgente, useInformesCliente } from './useAgentes'

const DEL_CLIENTE = AGENTES.filter((a) => a.porCliente)

/** Lo que hace falta para la campaña de Meta Ads (lo demás lo investiga el agente) */
function MetaAdsForm({
  abierto,
  cliente,
  onCerrar,
  onLanzar,
}: {
  abierto: boolean
  cliente: string
  onCerrar: () => void
  onLanzar: (p: Record<string, unknown>) => Promise<void>
}) {
  const [tipo, setTipo] = useState<'fisico' | 'infoproducto'>('fisico')
  const [moneda, setMoneda] = useState<'ARS' | 'USD'>('ARS')
  const [presupuesto, setPresupuesto] = useState('20000')
  const [dias, setDias] = useState('3')
  const [temporada, setTemporada] = useState('')
  const [productos, setProductos] = useState('')
  const [pagina, setPagina] = useState('')
  const [notas, setNotas] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setEnviando(true)
    setError(null)
    try {
      await onLanzar({ tipo, moneda, presupuesto_dia: parseNumero(presupuesto) ?? 20000, dias: parseNumero(dias) ?? 3, temporada, productos, pagina, notas })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo lanzar.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={`Campaña de Meta Ads · ${cliente}`}
      pie={
        <div className="flex w-full justify-end gap-2">
          <Button variant="secundario" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" form="form-meta" disabled={enviando}>
            {enviando ? <Spinner className="size-4" /> : <Megaphone className="size-4" />} Armar campaña
          </Button>
        </div>
      }
    >
      <form id="form-meta" onSubmit={enviar} className="flex flex-col gap-4">
        <p className="text-sm text-tenue">
          El agente investiga la marca, la competencia, los anuncios y la página de ventas, y arma la propuesta de campaña de validación lista para imprimir.
          Tarda unos 3 minutos. Lo que no sepas, dejalo vacío: lo investiga o lo marca como supuesto. Nunca crea ni toca campañas en Meta.
        </p>
        <Field label="Qué vende">
          <Segmentado
            opciones={[
              { valor: 'fisico', label: 'Productos físicos' },
              { valor: 'infoproducto', label: 'Infoproducto' },
            ]}
            valor={tipo}
            onChange={setTipo}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
          <Field label="Presupuesto por día">
            <Input inputMode="decimal" value={presupuesto} onChange={(e) => setPresupuesto(e.target.value)} />
          </Field>
          <Field label="Días">
            <Input inputMode="numeric" value={dias} onChange={(e) => setDias(e.target.value)} />
          </Field>
          <Field label="Moneda">
            <Segmentado
              opciones={[
                { valor: 'ARS', label: 'ARS' },
                { valor: 'USD', label: 'USD' },
              ]}
              valor={moneda}
              onChange={setMoneda}
            />
          </Field>
        </div>
        <Field label="Temporada u objetivo" ayuda='Por ejemplo "Navidad 2026" o "vuelta a clases".'>
          <Input value={temporada} onChange={(e) => setTemporada(e.target.value)} />
        </Field>
        <Field
          label={tipo === 'infoproducto' ? 'Producto, precio, plataforma y bonus' : 'Productos, costos y precios'}
          ayuda="Uno por línea si son varios. Si no los tenés, los busca en la tienda."
        >
          <textarea
            value={productos}
            onChange={(e) => setProductos(e.target.value)}
            rows={4}
            className="w-full rounded-[10px] border border-borde-fuerte bg-superficie px-3.5 py-2.5 text-[15px] focus:border-acento focus:outline-none"
          />
        </Field>
        <Field label="Página de ventas o tienda (link)">
          <Input value={pagina} onChange={(e) => setPagina(e.target.value)} placeholder="https://…" />
        </Field>
        <Field label="Notas" ayuda="Envíos, cuotas, stock, píxel, material para creativos…">
          <Input value={notas} onChange={(e) => setNotas(e.target.value)} />
        </Field>
        {error && <ErrorBox mensaje={error} />}
      </form>
    </Modal>
  )
}

/** Referentes del rubro para comparar (los últimos que se usaron con este cliente; si es deco o bazar, @ganga.home) */
function ContenidoForm({
  abierto,
  cliente,
  sugeridos,
  onCerrar,
  onLanzar,
}: {
  abierto: boolean
  cliente: string
  sugeridos: string
  onCerrar: () => void
  onLanzar: (p: Record<string, unknown>) => Promise<void>
}) {
  const [referentes, setReferentes] = useState(sugeridos)
  const [objetivo, setObjetivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setEnviando(true)
    setError(null)
    try {
      await onLanzar({ referentes, objetivo })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo lanzar.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={`Competencia y contenido · ${cliente}`}
      pie={
        <div className="flex w-full justify-end gap-2">
          <Button variant="secundario" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" form="form-contenido" disabled={enviando}>
            {enviando ? <Spinner className="size-4" /> : <TrendingUp className="size-4" />} Analizar
          </Button>
        </div>
      }
    >
      <form id="form-contenido" onSubmit={enviar} className="flex flex-col gap-4">
        <p className="text-sm text-tenue">
          Lee con la API de Meta el Instagram de {cliente} y el de sus referentes, busca más referentes grandes del rubro en Argentina y las
          tendencias, y te devuelve lo que hacen ellos y {cliente} no, 8 publicaciones listas para hacer y un calendario de 2 semanas. Tarda unos 3
          minutos. Nunca publica nada.
        </p>
        <Field label="Referentes del rubro" ayuda="Usuarios o links de Instagram, separados por coma o uno por línea (hasta 6). Tienen que ser cuentas de empresa o creador. El agente suma otros que encuentre.">
          <textarea
            value={referentes}
            onChange={(e) => setReferentes(e.target.value)}
            rows={3}
            placeholder="@ganga.home, @otra.cuenta"
            className="w-full rounded-[10px] border border-borde-fuerte bg-superficie px-3.5 py-2.5 text-[15px] focus:border-acento focus:outline-none"
          />
        </Field>
        <Field label="Objetivo (opcional)" ayuda='Por ejemplo "vender más online para Navidad" o "que pregunten más por WhatsApp".'>
          <Input value={objetivo} onChange={(e) => setObjetivo(e.target.value)} />
        </Field>
        {error && <ErrorBox mensaje={error} />}
      </form>
    </Modal>
  )
}

/** En la carpeta del cliente: los agentes que trabajan sobre él y sus últimos informes. */
export function AgentesCliente({ p }: { p: Prospecto }) {
  const navigate = useNavigate()
  const { informes, recargar } = useInformesCliente(p.id)
  const [corriendo, setCorriendo] = useState<IdAgente | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [meta, setMeta] = useState(false)
  const [contenido, setContenido] = useState(false)
  // Referentes sugeridos: los de la última vez con este cliente; si no, los grandes del rubro que ya conocemos
  const anteriores = informes.find((i) => i.agente === 'contenido' && i.datos?.parametros?.referentes?.length)?.datos.parametros?.referentes
  const rubro = `${p.rubro ?? ''} ${p.industria ?? ''}`.toLowerCase()
  const sugeridos = anteriores?.length ? anteriores.map((r) => `@${r}`).join(', ') : /deco|bazar|hogar/.test(rubro) ? '@ganga.home' : ''
  const cliente = p.empresa || p.nombre

  const correr = async (agente: IdAgente, parametros?: Record<string, unknown>) => {
    setCorriendo(agente)
    setError(null)
    try {
      const r = await correrAgente(agente, { prospecto_id: p.id, ...(parametros ? { parametros } : {}) })
      await recargar()
      if (r.id) navigate(`/agentes?informe=${r.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo correr el agente.')
      throw e
    } finally {
      setCorriendo(null)
    }
  }

  return (
    <section className="rounded-2xl border border-borde bg-superficie p-4 sm:p-5">
      <h2 className="mb-1 text-[19px] font-bold">Agentes</h2>
      <p className="mb-3 text-sm text-tenue">Trabajan para {cliente} en segundo plano: el resultado queda acá y en Agentes.</p>
      <div className="flex flex-col gap-2">
        {DEL_CLIENTE.map((a) => {
          const Icono = a.icono
          return (
            <Button
              key={a.id}
              variant="secundario"
              className="justify-start"
              disabled={corriendo != null}
              onClick={() => (a.id === 'meta_ads' ? setMeta(true) : a.id === 'contenido' ? setContenido(true) : correr(a.id).catch(() => {}))}
              title={a.queHace}
            >
              {corriendo === a.id ? <Spinner className="size-4" /> : <Icono className="size-4" />} {a.correrAhora}
            </Button>
          )
        })}
      </div>
      {error && (
        <div className="mt-3">
          <ErrorBox mensaje={error} />
        </div>
      )}
      {informes.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1 border-t border-borde pt-3">
          {informes.map((i) => {
            const Icono = DESCRIPCION[i.agente]?.icono
            const cortado = colgado(i)
            return (
              <li key={i.id}>
                <Link to={`/agentes?informe=${i.id}`} className="flex items-start gap-2.5 rounded-lg px-1 py-1.5 hover:bg-elevada">
                  {Icono && <Icono className={cn('mt-0.5 size-4 shrink-0', i.leido ? 'text-tenue' : 'text-acento-texto')} />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {i.estado === 'trabajando' && !cortado ? `${DESCRIPCION[i.agente]?.nombre}: trabajando…` : i.titulo}
                    </span>
                    <span className="text-xs text-tenue">{new Date(i.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}</span>
                  </span>
                  {i.estado === 'trabajando' && !cortado && <Spinner className="mt-0.5 size-3.5" />}
                  {(i.estado === 'error' || cortado) && <Badge tono="peligro">Error</Badge>}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      {contenido && (
        <ContenidoForm
          abierto
          cliente={cliente}
          sugeridos={sugeridos}
          onCerrar={() => setContenido(false)}
          onLanzar={async (parametros) => {
            await correr('contenido', parametros)
            setContenido(false)
          }}
        />
      )}
      <MetaAdsForm
        abierto={meta}
        cliente={cliente}
        onCerrar={() => setMeta(false)}
        onLanzar={async (parametros) => {
          await correr('meta_ads', parametros)
          setMeta(false)
        }}
      />
    </section>
  )
}
