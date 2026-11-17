import { useRef, useState } from 'react'
import { Play } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Segmentado } from '../../components/ui/Badge'
import { Field, Input } from '../../components/ui/Field'
import { ErrorBox } from '../../components/ui/ErrorBox'
import { modoAudio } from '../../lib/audioSession'
import { MODELOS_VOZ } from './useConfigVoz'

interface Props {
  abierto: boolean
  vozId: string
  modelo: string
  onCerrar: () => void
  onGuardar: (v: { vozId: string; modelo: string }) => Promise<void>
  onProbar: (v: { vozId: string; modelo: string }) => Promise<string>
}

/** Elegir la voz de ElevenLabs de Jarvis (por ejemplo, una argentina) y probarla antes de guardar. */
export function VozForm(props: Props) {
  if (!props.abierto) return null
  return <FormInterno {...props} />
}

function FormInterno({ vozId: inicialId, modelo: inicialModelo, onCerrar, onGuardar, onProbar }: Props) {
  const [vozId, setVozId] = useState(inicialId)
  const [modelo, setModelo] = useState<string>(inicialModelo || 'eleven_flash_v2_5')
  const [ocupado, setOcupado] = useState<'probando' | 'guardando' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)

  const idValido = !vozId.trim() || /^[A-Za-z0-9]{10,40}$/.test(vozId.trim())

  const probar = async () => {
    setOcupado('probando')
    setError(null)
    try {
      const url = await onProbar({ vozId, modelo })
      audio.current ??= new Audio()
      audio.current.src = url
      modoAudio('playback')
      await audio.current.play()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo probar.')
    } finally {
      setOcupado(null)
    }
  }

  const guardar = async () => {
    setOcupado('guardando')
    setError(null)
    try {
      await onGuardar({ vozId, modelo })
      onCerrar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
      setOcupado(null)
    }
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Voz de Jarvis"
      pie={
        <div className="ml-auto flex gap-2">
          <Button variant="secundario" onClick={onCerrar} disabled={!!ocupado}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={!!ocupado || !idValido}>
            {ocupado === 'guardando' ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="text-sm leading-relaxed text-suave">
          <p>
            La voz que viene por defecto ("Daniel") es británica: por eso suena con acento en inglés. Para una voz argentina:
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>
              En <b>elevenlabs.io</b> entrá a <b>Voices → Voice Library</b> (o <b>Explore</b>).
            </li>
            <li>
              Filtrá por idioma <b>Spanish</b> y acento <b>Argentinian</b> (o Latin American), y escuchá las que te gusten.
            </li>
            <li>
              Tocá <b>Add to My Voices</b> en la que elijas. Después, en <b>My Voices</b>, abrila y copiá su <b>Voice ID</b>.
            </li>
            <li>Pegalo acá abajo, tocá Probar y, si te gusta, Guardar.</li>
          </ol>
        </div>

        <Field label="Voice ID" ayuda="Vacío = la voz por defecto.">
          <Input value={vozId} onChange={(e) => setVozId(e.target.value)} placeholder="Pegá acá el Voice ID" autoCapitalize="off" spellCheck={false} />
        </Field>
        {!idValido && <p className="-mt-2 text-[13px] text-aviso">Eso no parece un Voice ID (son letras y números, sin espacios).</p>}

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Modelo</span>
          <Segmentado opciones={MODELOS_VOZ.map((m) => ({ valor: m.valor, label: m.label }))} valor={modelo} onChange={setModelo} />
          <span className="text-[13px] text-tenue">
            {modelo === 'eleven_flash_v2_5'
              ? 'Arranca a hablar enseguida y gasta la mitad de créditos. Recomendada para conversar.'
              : 'Suena un poco más natural, pero tarda más en arrancar y gasta el doble.'}
          </span>
        </div>

        <Button variant="secundario" className="w-fit" onClick={probar} disabled={!!ocupado || !idValido}>
          <Play className="size-4" /> {ocupado === 'probando' ? 'Generando…' : 'Probar'}
        </Button>

        {error && <ErrorBox mensaje={error} />}
      </div>
    </Modal>
  )
}
