import { useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Field, Input } from '../../components/ui/Field'
import { ErrorBox } from '../../components/ui/ErrorBox'

interface Props {
  abierto: boolean
  clave: string | null
  onCerrar: () => void
  onGuardar: (clave: string) => Promise<void>
}

/** La clave de MapTiler para la imagen satelital, el relieve y los edificios del mapa de Jarvis. */
export function MapaForm(props: Props) {
  if (!props.abierto) return null
  return <FormInterno {...props} />
}

function FormInterno({ clave: inicial, onCerrar, onGuardar }: Props) {
  const [clave, setClave] = useState(inicial ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const valida = !clave.trim() || /^[A-Za-z0-9_-]{10,80}$/.test(clave.trim())

  const guardar = async () => {
    setGuardando(true)
    setError(null)
    try {
      await onGuardar(clave)
      onCerrar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
      setGuardando(false)
    }
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Mapa de Jarvis"
      pie={
        <div className="ml-auto flex gap-2">
          <Button variant="secundario" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando || !valida}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 text-sm leading-relaxed text-suave">
        <p>
          Con una clave de <b>MapTiler</b> (gratis) el mapa muestra la <b>imagen satelital</b>, el <b>relieve</b> del cerro y los <b>edificios en 3D</b>.
          Sin clave, igual funciona con calles y edificios, sin foto satelital.
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Entrá a <b>cloud.maptiler.com</b> y creá una cuenta gratis (plan <b>Free</b>).
          </li>
          <li>
            En <b>Account → API keys</b>, abrí la clave que viene creada (o tocá <b>New key</b> y ponele "brixx hub").
          </li>
          <li>
            En <b>Allowed HTTP origins</b> agregá <code className="text-acento-texto">brixx-hub.vercel.app</code>, así nadie más la puede usar.
          </li>
          <li>Copiá la clave y pegala acá.</li>
        </ol>
        <p className="text-xs text-tenue">
          Esta clave está hecha para usarse en el navegador (por eso se restringe por dominio). No es secreta como las de Anthropic o ElevenLabs.
        </p>
        <Field label="Clave de MapTiler" ayuda="Vacía = mapa sin satélite.">
          <Input value={clave} onChange={(e) => setClave(e.target.value)} placeholder="Pegá acá la clave" autoCapitalize="off" spellCheck={false} />
        </Field>
        {!valida && <p className="-mt-2 text-[13px] text-aviso">Eso no parece una clave de MapTiler (son letras y números, sin espacios).</p>}
        {error && <ErrorBox mensaje={error} />}
      </div>
    </Modal>
  )
}
