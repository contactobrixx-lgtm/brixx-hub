import { AtSign, Globe, Mail, MessageCircle } from 'lucide-react'
import type { Prospecto } from '../../types/db'
import { normalizarUrl } from '../../lib/format'
import { dominio, usuarioInstagram } from './useClientes'

const CLASE = 'inline-flex min-w-0 items-center gap-1.5 text-sm text-acento-texto hover:underline'

/** Mail, WhatsApp, Instagram y web del cliente, como links directos. */
export function LinksCliente({ p, compacto = false }: { p: Prospecto; compacto?: boolean }) {
  const tel = (p.telefono ?? '').replace(/\D/g, '')
  const links = [
    p.email && { href: `mailto:${p.email}`, icono: Mail, texto: p.email, label: 'Mail' },
    tel.length >= 8 && { href: `https://wa.me/${tel}`, icono: MessageCircle, texto: p.telefono!, label: 'WhatsApp' },
    p.instagram && { href: normalizarUrl(p.instagram), icono: AtSign, texto: usuarioInstagram(p.instagram)!, label: 'Instagram' },
    p.web && { href: normalizarUrl(p.web), icono: Globe, texto: dominio(p.web)!, label: 'Web' },
  ].filter(Boolean) as { href: string; icono: typeof Mail; texto: string; label: string }[]
  if (!links.length) return null
  return (
    <div className={compacto ? 'flex flex-wrap gap-1' : 'flex flex-wrap gap-x-4 gap-y-1.5'}>
      {links.map(({ href, icono: Icono, texto, label }) =>
        compacto ? (
          <a
            key={label}
            href={href}
            target="_blank"
            rel="noreferrer"
            title={`${label}: ${texto}`}
            aria-label={`${label}: ${texto}`}
            className="relative z-10 flex size-9 items-center justify-center rounded-[10px] text-suave transition-colors hover:bg-elevada hover:text-texto"
          >
            <Icono className="size-4" />
          </a>
        ) : (
          <a key={label} href={href} target="_blank" rel="noreferrer" className={CLASE}>
            <Icono className="size-4 shrink-0" />
            <span className="truncate">{texto}</span>
          </a>
        ),
      )}
    </div>
  )
}
