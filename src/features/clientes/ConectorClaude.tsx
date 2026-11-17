import { useEffect, useState } from 'react'
import { Check, Copy, ShieldAlert } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { ErrorBox } from '../../components/ui/ErrorBox'
import { Spinner } from '../../components/ui/Spinner'

/** Enlace del conector para Claude (función "conector"): con él, los chats de Claude cargan y actualizan clientes del hub. */
export function ConectorClaude({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    if (!abierto || url) return
    let vivo = true
    supabase.functions
      .invoke('conector', { body: { accion: 'enlace' } })
      .then(({ data, error }) => {
        if (!vivo) return
        if (error || !data?.url) setError('No se pudo obtener el enlace. ¿Ya se publicó la función "conector"?')
        else setUrl(data.url as string)
      })
    return () => {
      vivo = false
    }
  }, [abierto, url])

  const copiar = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      window.setTimeout(() => setCopiado(false), 2000)
    } catch {
      /* sin permiso de portapapeles: se puede seleccionar a mano */
    }
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Conectar con Claude">
      <p className="text-suave">
        Con este conector, los chats de Claude (la web o la app de escritorio) buscan clientes del hub, cargan clientes nuevos como
        intervención (el hub los analiza y crea su carpeta en el pipeline) y completan sus datos. Jarvis ve todo lo que se cargue.
      </p>

      <h3 className="mt-6 mb-2 text-base font-semibold">Enlace</h3>
      {error && <ErrorBox mensaje={error} />}
      {!error && !url && <Spinner />}
      {url && (
        <>
          <p className="rounded-xl bg-elevada p-3.5 font-mono text-[13px] break-all text-suave select-all">{url}</p>
          <div className="mt-3">
            <Button size="sm" variant="secundario" onClick={copiar}>
              {copiado ? <Check className="size-4" /> : <Copy className="size-4" />} {copiado ? 'Copiado' : 'Copiar enlace'}
            </Button>
          </div>
        </>
      )}

      <h3 className="mt-6 mb-2 text-base font-semibold">Cómo agregarlo en Claude</h3>
      <ol className="list-decimal space-y-1.5 pl-5 text-suave">
        <li>En Claude: Configuración → Conectores → Agregar conector personalizado.</li>
        <li>
          Nombre: <span className="text-texto">brixx hub</span>. URL: el enlace de arriba.
        </li>
        <li>
          En Autenticación elegí <span className="text-texto">Sin inicio de sesión</span> y guardá.
        </li>
        <li>En un chat, activá el conector y escribí por ejemplo “nuevo cliente de brixx @marca + datos + links”.</li>
      </ol>

      <div className="mt-6 flex items-start gap-2 rounded-[10px] bg-aviso-tenue px-3.5 py-3 text-sm text-aviso">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" />
        <span>
          El enlace es la llave: quien lo tenga puede leer y cargar clientes. No lo compartas fuera de los socios. Si se filtra, se cambia
          cargando el secret CONECTOR_VERSION en Supabase.
        </span>
      </div>
    </Modal>
  )
}
