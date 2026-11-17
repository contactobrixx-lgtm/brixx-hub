import { useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Field, Textarea } from '../../components/ui/Field'
import { ErrorBox } from '../../components/ui/ErrorBox'

const EJEMPLO = `Tono: profesional, con humor seco, como el Jarvis de Tony Stark. Tratame de "jefe" de vez en cuando.
Prioridades: primero lo que trae plata (cobros, cotizaciones por cerrar), después lo demás.
Respuestas: bien cortas por voz. Si algo está vencido, decilo primero.
Evitá: frases de relleno como "¡Excelente pregunta!".`

interface Props {
  abierto: boolean
  texto: string
  onCerrar: () => void
  onGuardar: (texto: string) => Promise<void>
}

/** Editar la personalidad de Jarvis (el "SOUL.md" del hub). */
export function PersonalidadForm(props: Props) {
  if (!props.abierto) return null
  return <FormInterno {...props} />
}

function FormInterno({ texto: inicial, onCerrar, onGuardar }: Props) {
  const [texto, setTexto] = useState(inicial)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const guardar = async () => {
    setGuardando(true)
    setError(null)
    try {
      await onGuardar(texto)
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
      titulo="Personalidad de Jarvis"
      pie={
        <div className="ml-auto flex gap-2">
          <Button variant="secundario" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm leading-relaxed text-suave">
          Escribí cómo querés que sea Jarvis: su tono, qué priorizar, qué evitar. Lo tiene en cuenta en cada respuesta, para los dos socios.
          Las reglas de fondo no cambian: no inventa datos y no hace nada en el hub sin que lo confirmes.
        </p>
        <Field label="Personalidad">
          <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={12} maxLength={4000} placeholder={EJEMPLO} />
        </Field>
        {!texto && (
          <Button size="sm" variant="fantasma" className="w-fit" onClick={() => setTexto(EJEMPLO)}>
            Usar el ejemplo como punto de partida
          </Button>
        )}
        {error && <ErrorBox mensaje={error} />}
      </div>
    </Modal>
  )
}
