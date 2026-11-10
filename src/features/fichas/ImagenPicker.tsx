import { useEffect, useRef, useState, type DragEvent } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import { cn } from '../../components/ui/cn'

interface Props {
  /** URL de la imagen actual guardada (firmada). */
  actualUrl?: string
  archivo: File | null
  quitada: boolean
  onArchivo: (f: File | null) => void
  onQuitar: () => void
}

export function ImagenPicker({ actualUrl, archivo, quitada, onArchivo, onQuitar }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [arrastrando, setArrastrando] = useState(false)

  useEffect(() => {
    if (!archivo) return setPreview(null)
    const url = URL.createObjectURL(archivo)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [archivo])

  // Pegar una captura con Ctrl/Cmd+V mientras el formulario está abierto
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const img = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'))
      if (img) {
        e.preventDefault()
        onArchivo(img)
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [onArchivo])

  const mostrar = preview ?? (quitada ? null : actualUrl)

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setArrastrando(false)
    const f = e.dataTransfer.files[0]
    if (f) onArchivo(f)
  }

  return (
    <div>
      <span className="mb-1.5 block text-xs font-medium text-suave">Captura / imagen de portada</span>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setArrastrando(true)
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={onDrop}
        className={cn(
          'relative flex w-full items-center justify-center overflow-hidden rounded-xl border border-dashed bg-fondo transition-colors',
          mostrar ? 'aspect-[16/9]' : 'h-36',
          arrastrando ? 'border-acento bg-acento-tenue' : 'border-borde-fuerte',
        )}
      >
        {mostrar ? (
          <>
            <img src={mostrar} alt="" className="size-full object-cover object-top" />
            <div className="absolute right-2 bottom-2 flex gap-1.5">
              <button
                type="button"
                onClick={() => input.current?.click()}
                className="cursor-pointer rounded-lg border border-borde bg-fondo/90 px-2.5 py-1.5 text-xs text-texto backdrop-blur hover:bg-hover"
              >
                Cambiar
              </button>
              <button
                type="button"
                onClick={() => (archivo ? onArchivo(null) : onQuitar())}
                className="cursor-pointer rounded-lg border border-borde bg-fondo/90 p-1.5 text-peligro backdrop-blur hover:bg-hover"
                aria-label="Quitar imagen"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex size-full cursor-pointer flex-col items-center justify-center gap-2 text-sm text-suave hover:text-texto"
          >
            <ImagePlus className="size-6 text-acento" />
            <span>Subir, arrastrar o pegar (Ctrl+V)</span>
            <span className="text-xs text-tenue">PNG, JPG o WebP · máx. 5 MB</span>
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onArchivo(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}
