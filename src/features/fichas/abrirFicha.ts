import type { NavigateFunction } from 'react-router-dom'
import type { Ficha } from '../../types/db'

export function abrirEnPestana(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

/** Abre la ficha según su modo: visor embebido o pestaña nueva. */
export function abrirFicha(ficha: Ficha, navigate: NavigateFunction) {
  if (ficha.modo_apertura === 'iframe') navigate(`/ver/${ficha.id}`)
  else abrirEnPestana(ficha.url)
}
