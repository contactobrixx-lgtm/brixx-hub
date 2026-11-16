import { useRef, useState, type FormEvent } from 'react'
import { FileAudio, Upload } from 'lucide-react'
import type { Prospecto } from '../../types/db'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Field, Input, Select } from '../../components/ui/Field'
import { ErrorBox } from '../../components/ui/ErrorBox'
import { formatDuracion } from '../../lib/format'
import { duracionDeArchivo, EXTENSIONES_AUDIO, mimeDeArchivo } from './useGrabaciones'

const MAX_MB = 50

interface Props {
  abierto: boolean
  prospectos: Prospecto[]
  onCerrar: () => void
  /** Sube el archivo y crea la grabación */
  onSubir: (archivo: File, datos: { titulo: string; prospecto_id: string | null; segundos: number | null; mime: string }) => Promise<void>
}

/** Hoja lateral para subir un audio (por ejemplo, una nota de voz de WhatsApp) y que Claude diga qué quiere la persona. */
export function SubirAudioForm(props: Props) {
  if (!props.abierto) return null
  return <FormInterno {...props} />
}

function FormInterno({ prospectos, onCerrar, onSubir }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [segundos, setSegundos] = useState<number | null>(null)
  const [titulo, setTitulo] = useState('')
  const [prospectoId, setProspectoId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [subiendo, setSubiendo] = useState(false)

  const nombreP = (p: Prospecto) => (p.empresa ? `${p.empresa} · ${p.nombre}` : p.nombre)
  const ordenados = [...prospectos].sort((a, b) => nombreP(a).localeCompare(nombreP(b)))

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
    return p ? `Audio de ${p.empresa || p.nombre} · ${fecha}` : `Audio de WhatsApp · ${fecha}`
  }

  const subir = async (e: FormEvent) => {
    e.preventDefault()
    if (!archivo) return setError('Elegí el audio.')
    setSubiendo(true)
    setError(null)
    try {
      await onSubir(archivo, {
        titulo: titulo.trim() || tituloPorDefecto(),
        prospecto_id: prospectoId || null,
        segundos,
        mime: mimeDeArchivo(archivo)!,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir el audio.')
      setSubiendo(false)
    }
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Subir audio"
      pie={
        <div className="ml-auto flex gap-2">
          <Button variant="secundario" onClick={onCerrar} disabled={subiendo}>
            Cancelar
          </Button>
          <Button type="submit" form="form-subir-audio" disabled={subiendo || !archivo}>
            {subiendo ? 'Subiendo…' : 'Subir y analizar'}
          </Button>
        </div>
      }
    >
      <form id="form-subir-audio" onSubmit={subir} className="flex flex-col gap-4">
        <p className="text-sm leading-relaxed text-suave">
          Subí una nota de voz y Claude te dice qué quiere la persona y te sugiere qué contestarle. En WhatsApp: mantené
          apretado el audio → <b>Compartir</b> → guardalo en Archivos, y elegilo acá.
        </p>

        <input
          ref={input}
          type="file"
          accept={`audio/*,${EXTENSIONES_AUDIO.map((e) => `.${e}`).join(',')}`}
          className="hidden"
          onChange={(e) => elegir(e.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-borde-fuerte bg-superficie px-4 py-5 text-center transition-colors hover:border-acento"
        >
          {archivo ? (
            <>
              <FileAudio className="size-6 text-acento-texto" />
              <span className="max-w-full truncate font-semibold">{archivo.name}</span>
              <span className="text-[13px] text-tenue">
                {archivo.size < 1024 * 1024 ? `${Math.max(1, Math.round(archivo.size / 1024))} KB` : `${(archivo.size / 1024 / 1024).toFixed(1)} MB`}{segundos ? ` · ${formatDuracion(segundos)}` : ''} · tocá para cambiarlo
              </span>
            </>
          ) : (
            <>
              <Upload className="size-6 text-tenue" />
              <span className="font-semibold">Elegir audio</span>
              <span className="text-[13px] text-tenue">.opus (WhatsApp), .ogg, .m4a, .mp3 o .wav · hasta {MAX_MB} MB</span>
            </>
          )}
        </button>

        <Field label="¿De quién es?" ayuda="Si es de un cliente o prospecto, Claude usa su contexto y la respuesta sale mejor.">
          <Select value={prospectoId} onChange={(e) => setProspectoId(e.target.value)}>
            <option value="">— Sin cliente o prospecto —</option>
            {ordenados.map((p) => (
              <option key={p.id} value={p.id}>
                {nombreP(p)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Título (opcional)">
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={tituloPorDefecto()} maxLength={120} />
        </Field>

        {error && <ErrorBox mensaje={error} />}
      </form>
    </Modal>
  )
}
