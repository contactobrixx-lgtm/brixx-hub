import { useRef, useState, type FormEvent } from 'react'
import { FileAudio, Link2, Plus, Upload, X } from 'lucide-react'
import type { Prospecto } from '../../types/db'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Field, Input, Select, Textarea } from '../../components/ui/Field'
import { ErrorBox } from '../../components/ui/ErrorBox'
import { formatDuracion, normalizarUrl } from '../../lib/format'
import { duracionDeArchivo, EXTENSIONES_AUDIO, mimeDeArchivo } from './useGrabaciones'

const MAX_MB = 50
const MAX_LINKS = 5

export interface DatosIntervencion {
  archivo: File | null
  mime: string | null
  segundos: number | null
  texto: string
  urls: string[]
  titulo: string
  prospecto_id: string | null
}

interface Props {
  abierto: boolean
  prospectos: Prospecto[]
  /** Cliente ya elegido (por ejemplo, desde su carpeta) */
  prospectoInicial?: string | null
  onCerrar: () => void
  onGuardar: (datos: DatosIntervencion) => Promise<void>
}

/**
 * Hoja lateral para cargar una intervención con un cliente: un audio (nota de voz de WhatsApp),
 * un texto (chat, mail o notas) y/o links de su Instagram o web. Claude la analiza y, si el
 * cliente no tiene carpeta, la crea.
 */
export function IntervencionForm(props: Props) {
  if (!props.abierto) return null
  return <FormInterno {...props} />
}

function FormInterno({ prospectos, prospectoInicial, onCerrar, onGuardar }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [segundos, setSegundos] = useState<number | null>(null)
  const [texto, setTexto] = useState('')
  const [urls, setUrls] = useState<string[]>([''])
  const [titulo, setTitulo] = useState('')
  const [prospectoId, setProspectoId] = useState(prospectoInicial ?? '')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const nombreP = (p: Prospecto) => (p.empresa ? `${p.empresa} · ${p.nombre}` : p.nombre)
  const ordenados = [...prospectos].sort((a, b) => nombreP(a).localeCompare(nombreP(b)))
  const links = urls.map((u) => u.trim()).filter(Boolean)
  const hayAlgo = !!archivo || !!texto.trim() || links.length > 0

  const elegir = async (f: File | undefined) => {
    setError(null)
    if (!f) return
    if (!mimeDeArchivo(f)) return setError('Ese archivo no parece un audio. Probá con .opus, .ogg, .m4a, .mp3 o .wav.')
    if (f.size > MAX_MB * 1024 * 1024) return setError(`El audio pesa más de ${MAX_MB} MB.`)
    setArchivo(f)
    setSegundos(await duracionDeArchivo(f))
  }

  const tituloPorDefecto = () => {
    const p = prospectos.find((x) => x.id === prospectoId)
    const fecha = new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
    const tipo = archivo ? 'Audio' : texto.trim() ? 'Mensaje' : 'Links'
    return p ? `${tipo} de ${p.empresa || p.nombre} · ${fecha}` : `${tipo} de cliente · ${fecha}`
  }

  const guardar = async (e: FormEvent) => {
    e.preventDefault()
    if (!hayAlgo) return setError('Cargá un audio, pegá un texto o agregá al menos un link.')
    const invalido = links.find((u) => !/^(https?:\/\/)?[^\s/]+\.[^\s]{2,}/i.test(u))
    if (invalido) return setError(`"${invalido}" no parece un link.`)
    setGuardando(true)
    setError(null)
    try {
      await onGuardar({
        archivo,
        mime: archivo ? mimeDeArchivo(archivo) : null,
        segundos,
        texto,
        urls: links.slice(0, MAX_LINKS).map(normalizarUrl),
        titulo: titulo.trim() || tituloPorDefecto(),
        prospecto_id: prospectoId || null,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
      setGuardando(false)
    }
  }

  const tamano = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`)

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Nueva intervención"
      pie={
        <div className="ml-auto flex gap-2">
          <Button variant="secundario" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button type="submit" form="form-intervencion" disabled={guardando || !hayAlgo}>
            {guardando ? 'Guardando…' : 'Analizar'}
          </Button>
        </div>
      }
    >
      <form id="form-intervencion" onSubmit={guardar} className="flex flex-col gap-4">
        <p className="text-sm leading-relaxed text-suave">
          Cargá lo que tengas después de hablar con el cliente: un audio, el chat o tus notas, y sus links. Claude te devuelve
          sus dolores, cuellos de botella, qué ofrecerle y una propuesta para mandarle.
        </p>

        <Field label="Cliente">
          <Select value={prospectoId} onChange={(e) => setProspectoId(e.target.value)}>
            <option value="">Detectarlo solo (o crear su carpeta)</option>
            {ordenados.map((p) => (
              <option key={p.id} value={p.id}>
                {nombreP(p)}
              </option>
            ))}
          </Select>
        </Field>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Audio (opcional)</span>
          <input
            ref={input}
            type="file"
            accept={`audio/*,${EXTENSIONES_AUDIO.map((e) => `.${e}`).join(',')}`}
            className="hidden"
            onChange={(e) => elegir(e.target.files?.[0])}
          />
          {archivo ? (
            <div className="flex items-center gap-3 rounded-xl border border-borde-fuerte bg-superficie px-3.5 py-3">
              <FileAudio className="size-5 shrink-0 text-acento-texto" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{archivo.name}</span>
                <span className="text-[13px] text-tenue">
                  {tamano(archivo.size)}
                  {segundos ? ` · ${formatDuracion(segundos)}` : ''}
                </span>
              </span>
              <Button
                size="icono"
                variant="fantasma"
                aria-label="Quitar audio"
                onClick={() => {
                  setArchivo(null)
                  setSegundos(null)
                  if (input.current) input.current.value = ''
                }}
              >
                <X className="size-4" />
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-borde-fuerte bg-superficie px-4 py-3 text-sm transition-colors hover:border-acento"
            >
              <Upload className="size-4 text-tenue" />
              <span className="font-semibold">Elegir audio</span>
              <span className="text-tenue">.opus (WhatsApp), .m4a, .mp3…</span>
            </button>
          )}
        </div>

        <Field label="Texto (opcional)" ayuda="Pegá el chat de WhatsApp, un mail o tus notas de la charla.">
          <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={6} maxLength={30000} placeholder="Hola! Te escribo porque…" />
        </Field>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Links del cliente (opcional)</span>
          {urls.map((u, i) => (
            <div key={i} className="flex items-center gap-2">
              <Link2 className="size-4 shrink-0 text-tenue" />
              <Input
                value={u}
                onChange={(e) => setUrls((l) => l.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder={i === 0 ? 'instagram.com/su_negocio' : 'su-web.com.ar'}
                inputMode="url"
                autoCapitalize="off"
              />
              {urls.length > 1 && (
                <Button size="icono" variant="fantasma" aria-label="Quitar link" onClick={() => setUrls((l) => l.filter((_, j) => j !== i))}>
                  <X className="size-4" />
                </Button>
              )}
            </div>
          ))}
          {urls.length < MAX_LINKS && (
            <button
              type="button"
              onClick={() => setUrls((l) => [...l, ''])}
              className="inline-flex w-fit cursor-pointer items-center gap-1.5 text-sm font-semibold text-acento-texto hover:underline"
            >
              <Plus className="size-4" /> Agregar link
            </button>
          )}
          <span className="text-[13px] text-tenue">Claude lee la web para entender el negocio. Instagram casi no se deja leer: igual queda guardado en la carpeta.</span>
        </div>

        <Field label="Título (opcional)">
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={tituloPorDefecto()} maxLength={120} />
        </Field>

        {error && <ErrorBox mensaje={error} />}
      </form>
    </Modal>
  )
}
