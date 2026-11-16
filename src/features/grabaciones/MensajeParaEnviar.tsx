import { useState } from 'react'
import { Check, Copy, Mail, MessageCircle } from 'lucide-react'
import { Button } from '../../components/ui/Button'

/** Link para abrir WhatsApp con el mensaje escrito (al número del cliente si lo tiene cargado). */
export function linkWhatsApp(texto: string, telefono: string | null) {
  const numero = (telefono ?? '').replace(/\D/g, '')
  return `https://wa.me/${numero.length >= 10 ? numero : ''}?text=${encodeURIComponent(texto)}`
}

const CLASE_LINK =
  'inline-flex min-h-[38px] items-center gap-1.5 rounded-[11px] border px-3 text-sm font-semibold transition-colors'

interface Props {
  texto: string
  telefono: string | null
  /** Si está, se ofrece "Mandar por mail" con este asunto */
  email?: string | null
  asunto?: string
}

/** Un mensaje sugerido para el cliente, con copiar / abrir WhatsApp / mandar por mail. */
export function MensajeParaEnviar({ texto, telefono, email, asunto }: Props) {
  const [copiado, setCopiado] = useState(false)
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(asunto ? `${asunto}\n\n${texto}` : texto)
      setCopiado(true)
      window.setTimeout(() => setCopiado(false), 2000)
    } catch {
      /* sin permiso de portapapeles: se puede seleccionar a mano */
    }
  }
  return (
    <>
      <p className="rounded-xl bg-elevada p-3.5 leading-relaxed whitespace-pre-line text-suave select-text">{texto}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="secundario" onClick={copiar}>
          {copiado ? <Check className="size-4" /> : <Copy className="size-4" />} {copiado ? 'Copiado' : 'Copiar'}
        </Button>
        <a
          href={linkWhatsApp(texto, telefono)}
          target="_blank"
          rel="noreferrer"
          className={`${CLASE_LINK} border-acento bg-acento text-white hover:bg-acento-fuerte`}
        >
          <MessageCircle className="size-4" /> Abrir en WhatsApp
        </a>
        {email && (
          <a
            href={`mailto:${email}?subject=${encodeURIComponent(asunto ?? '')}&body=${encodeURIComponent(texto)}`}
            className={`${CLASE_LINK} border-borde-fuerte bg-superficie text-texto hover:border-tenue`}
          >
            <Mail className="size-4" /> Mandar por mail
          </a>
        )}
      </div>
      <p className="mt-2 text-[13px] text-tenue">Revisalo antes de mandarlo: es una sugerencia.</p>
    </>
  )
}
