import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Mic, Pause, Play, Square, Sun, Upload } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { useGrabadora } from '../features/grabaciones/useGrabadora'
import { useConfigGrabaciones, useGrabaciones } from '../features/grabaciones/useGrabaciones'
import { AvisoConfig } from '../features/grabaciones/AvisoConfig'
import { useReuniones } from '../features/calendario/useReuniones'
import { useProspectos } from '../features/pipeline/useProspectos'
import { PageHeader } from '../components/layout/PageHeader'
import { Button } from '../components/ui/Button'
import { Field, Input, Select } from '../components/ui/Field'
import { ErrorBox } from '../components/ui/ErrorBox'
import { Spinner } from '../components/ui/Spinner'
import { cn } from '../components/ui/cn'
import { formatDuracion, formatHora } from '../lib/format'

export function GrabarPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { miembro } = useAuth()
  const grabadora = useGrabadora()
  const { subir } = useGrabaciones()
  const config = useConfigGrabaciones()
  const { filas: reuniones } = useReuniones()
  const { prospectos } = useProspectos()

  const [reunionId, setReunionId] = useState(params.get('reunion') ?? '')
  const [prospectoId, setProspectoId] = useState('')
  const [titulo, setTitulo] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, setPendiente] = useState<{ blob: Blob; segundos: number } | null>(null)

  const reunion = reuniones.find((r) => r.id === reunionId)

  // Reuniones de hoy y de los últimos/próximos días, para vincular rápido
  const reunionesCercanas = useMemo(() => {
    const ahora = Date.now()
    return reuniones.filter((r) => Math.abs(new Date(r.inicio).getTime() - ahora) < 7 * 864e5)
  }, [reuniones])

  const tituloFinal = () =>
    titulo.trim() ||
    reunion?.titulo ||
    `Reunión del ${new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} ${formatHora(new Date())}`

  const activo = grabadora.estado === 'grabando' || grabadora.estado === 'pausado'

  // Avisar antes de cerrar la pestaña mientras graba
  useEffect(() => {
    if (!activo) return
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', aviso)
    return () => window.removeEventListener('beforeunload', aviso)
  }, [activo])

  const enviar = async (audio: { blob: Blob; segundos: number }) => {
    setSubiendo(true)
    setError(null)
    try {
      const id = await subir(audio.blob, {
        titulo: tituloFinal(),
        segundos: audio.segundos,
        reunion_id: reunionId || null,
        prospecto_id: prospectoId || reunion?.prospecto_id || null,
        grabado_por: miembro?.email ?? null,
      })
      await grabadora.descartarCopia()
      navigate(`/grabaciones/${id}`, { replace: true })
    } catch (e) {
      // La copia local se conserva: se puede reintentar.
      setPendiente(audio)
      setError(e instanceof Error ? e.message : 'No se pudo subir el audio.')
      setSubiendo(false)
    }
  }

  const terminar = async () => enviar(await grabadora.terminar())

  const recuperar = async () => {
    const audio = await grabadora.recuperar()
    if (audio) enviar(audio)
    else grabadora.descartarCopia()
  }

  const nombre = (p: { empresa: string | null; nombre: string }) => (p.empresa ? `${p.empresa} · ${p.nombre}` : p.nombre)

  return (
    <div className="mx-auto w-full max-w-[640px] px-4 pt-6 pb-16 md:px-10 md:pt-8">
      <PageHeader titulo="Grabar reunión" subtitulo="Se transcribe y se resume sola: lo importante, próximos pasos y una propuesta de trabajo." />

      {!activo && !subiendo && <AvisoConfig config={config} />}

      {grabadora.recuperable && !activo && !subiendo && (
        <div className="mb-5 rounded-2xl border border-aviso/40 bg-aviso-tenue p-4">
          <p className="text-sm text-aviso">
            Quedó una grabación sin terminar de {formatDuracion(grabadora.recuperable.segundos)} (
            {new Date(grabadora.recuperable.inicio).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}, {formatHora(new Date(grabadora.recuperable.inicio))}).
          </p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={recuperar}>
              <Upload className="size-4" /> Recuperar y subir
            </Button>
            <Button size="sm" variant="fantasma" onClick={() => grabadora.descartarCopia()}>
              Descartar
            </Button>
          </div>
        </div>
      )}

      {/* Datos (antes de grabar) */}
      {grabadora.estado === 'inactivo' && !subiendo && (
        <div className="mb-6 space-y-4 rounded-2xl border border-borde bg-superficie p-4 sm:p-5">
          <Field label="Reunión del calendario (opcional)">
            <Select
              value={reunionId}
              onChange={(e) => {
                setReunionId(e.target.value)
                setProspectoId('')
              }}
            >
              <option value="">— Sin vincular —</option>
              {(reunion && !reunionesCercanas.includes(reunion) ? [reunion, ...reunionesCercanas] : reunionesCercanas).map((r) => (
                <option key={r.id} value={r.id}>
                  {new Date(r.inicio).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} {formatHora(new Date(r.inicio))} · {r.titulo}
                </option>
              ))}
            </Select>
          </Field>
          {!reunion?.prospecto_id && (
            <Field label="Cliente o prospecto (opcional)" ayuda="Sirve para que la propuesta tenga en cuenta su contexto.">
              <Select value={prospectoId} onChange={(e) => setProspectoId(e.target.value)}>
                <option value="">— Ninguno —</option>
                {[...prospectos]
                  .sort((a, b) => nombre(a).localeCompare(nombre(b)))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {nombre(p)}
                    </option>
                  ))}
              </Select>
            </Field>
          )}
          <Field label="Título (opcional)">
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={reunion?.titulo ?? 'Reunión con…'} />
          </Field>
        </div>
      )}

      {/* Grabadora */}
      <section className="flex flex-col items-center rounded-2xl border border-borde bg-superficie px-4 py-10">
        {subiendo ? (
          <>
            <Spinner className="size-10" />
            <p className="mt-4 font-semibold">Subiendo el audio…</p>
            <p className="mt-1 text-sm text-tenue">No cierres esta pantalla hasta que termine.</p>
          </>
        ) : (
          <>
            <div className="tabular font-display text-6xl font-bold tracking-tight">{formatDuracion(grabadora.segundos)}</div>
            <div className="mt-2 flex h-6 items-center gap-2 text-sm">
              {grabadora.estado === 'grabando' && (
                <>
                  <span className="size-2.5 animate-pulse rounded-full bg-peligro" /> <span className="text-suave">Grabando</span>
                </>
              )}
              {grabadora.estado === 'pausado' && <span className="text-aviso">En pausa</span>}
              {grabadora.estado === 'pidiendo' && <span className="text-tenue">Pidiendo permiso para el micrófono…</span>}
            </div>

            {grabadora.estado === 'inactivo' || grabadora.estado === 'pidiendo' ? (
              <button
                onClick={grabadora.empezar}
                disabled={grabadora.estado === 'pidiendo'}
                className="mt-8 grid size-24 cursor-pointer place-items-center rounded-full bg-peligro text-white shadow-lg transition-transform active:scale-95 disabled:opacity-60"
                aria-label="Empezar a grabar"
              >
                <Mic className="size-10" />
              </button>
            ) : activo ? (
              <div className="mt-8 flex items-center gap-4">
                <Button
                  variant="secundario"
                  className="size-16 rounded-full"
                  onClick={grabadora.estado === 'grabando' ? grabadora.pausar : grabadora.reanudar}
                  aria-label={grabadora.estado === 'grabando' ? 'Pausar' : 'Reanudar'}
                >
                  {grabadora.estado === 'grabando' ? <Pause className="size-6" /> : <Play className="size-6" />}
                </Button>
                <button
                  onClick={terminar}
                  className="grid size-24 cursor-pointer place-items-center rounded-full bg-texto text-fondo shadow-lg transition-transform active:scale-95"
                  aria-label="Terminar y procesar"
                >
                  <Square className="size-9 fill-current" />
                </button>
              </div>
            ) : null}

            <p className="mt-6 text-center text-sm text-tenue">
              {grabadora.estado === 'inactivo'
                ? 'Tocá el micrófono para empezar.'
                : activo
                  ? 'Tocá el cuadrado para terminar y procesar.'
                  : ''}
            </p>
          </>
        )}
      </section>

      {activo && (
        <div
          className={cn(
            'mt-4 flex items-start gap-2.5 rounded-[10px] px-3.5 py-3 text-sm',
            grabadora.pantallaFija ? 'bg-elevada text-suave' : 'bg-aviso-tenue text-aviso',
          )}
        >
          <Sun className="mt-0.5 size-4 shrink-0" />
          <span>
            {grabadora.pantallaFija
              ? 'La pantalla queda prendida mientras grabás. No bloquees el teléfono ni cambies de app: el celular corta el micrófono.'
              : 'Dejá la pantalla prendida y esta app abierta: si bloqueás el teléfono o cambiás de app, el celular corta el micrófono. Lo grabado hasta ese momento se puede recuperar.'}
          </span>
        </div>
      )}

      {(error || grabadora.error) && (
        <div className="mt-4 space-y-3">
          <ErrorBox mensaje={error ?? grabadora.error!} />
          {pendiente && (
            <Button onClick={() => enviar(pendiente)}>
              <Upload className="size-4" /> Reintentar la subida
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
