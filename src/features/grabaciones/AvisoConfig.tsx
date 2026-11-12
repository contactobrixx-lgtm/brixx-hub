import { Info } from 'lucide-react'
import type { ConfigGrabaciones } from './useGrabaciones'

/** Explica qué falta configurar para transcribir y analizar. */
export function AvisoConfig({ config }: { config: ConfigGrabaciones | null }) {
  if (!config || (config.funcion && config.assemblyai && config.anthropic)) return null
  const texto = !config.funcion
    ? 'Podés grabar igual: los audios se guardan y quedan "Pendientes de transcribir". Falta publicar la función de grabaciones en Supabase.'
    : !config.assemblyai
      ? 'Podés grabar igual: los audios se guardan y quedan "Pendientes de transcribir" hasta que cargues la clave de AssemblyAI.'
      : 'Las transcripciones funcionan. Para el resumen, los puntos clave y la propuesta falta cargar la clave de Anthropic (Claude).'
  return (
    <div className="mb-5 flex items-start gap-2.5 rounded-[10px] bg-acento-tenue px-3.5 py-3 text-sm text-acento-claro">
      <Info className="mt-0.5 size-4 shrink-0" />
      <span>
        {texto} <span className="text-acento-texto">Los pasos están en el README → "Grabaciones de reuniones".</span>
      </span>
    </div>
  )
}
