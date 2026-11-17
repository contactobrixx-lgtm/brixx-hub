import { useCallback, useEffect, useRef, useState } from 'react'
import { agentesDemo, pasosDemo, type PasoDemo } from './demo'
import type { DestinoPantalla } from './PanelPantalla'
import type { AgenteMision } from './useMisiones'

interface VozDemo {
  hablando: boolean
  decir: (texto: string) => Promise<void>
  callar: () => void
}

/**
 * Modo demo de Jarvis: recorre el guion de `demo.ts` paso a paso. En cada paso abre la pantalla (si tiene),
 * lo dice en voz alta y, cuando termina de hablar, pasa al siguiente. Sin voz, avanza por tiempo.
 */
export function useDemo(voz: VozDemo, conVoz: boolean, abrir: (d: DestinoPantalla | null) => void) {
  const [pasos, setPasos] = useState<PasoDemo[]>([])
  const [indice, setIndice] = useState<number | null>(null)
  const [agentes, setAgentes] = useState<AgenteMision[]>([])

  const vozRef = useRef(voz)
  vozRef.current = voz
  const abrirRef = useRef(abrir)
  abrirRef.current = abrir
  const conVozRef = useRef(conVoz)
  conVozRef.current = conVoz
  /** true mientras el paso actual está hablando (para saber cuándo termina) */
  const hablaEstePaso = useRef(false)

  const indiceRef = useRef(indice)
  indiceRef.current = indice

  const salir = useCallback(() => {
    hablaEstePaso.current = false
    if (indiceRef.current != null) {
      vozRef.current.callar()
      abrirRef.current(null)
    }
    setIndice(null)
    setAgentes([])
  }, [])

  const iniciar = useCallback(() => {
    setPasos(pasosDemo())
    setIndice(0)
  }, [])

  const siguiente = useCallback(() => setIndice((i) => (i == null ? null : i + 1)), [])
  const anterior = useCallback(() => setIndice((i) => (i == null ? null : Math.max(0, i - 1))), [])

  const paso = indice != null ? pasos[indice] : undefined

  // Cada paso: abre su pantalla, lo dice y programa un tope por si la voz se traba
  useEffect(() => {
    if (indice == null) return
    if (!paso) {
      // Terminó el recorrido
      salir()
      return
    }
    abrirRef.current(paso.pantalla ?? null)
    if (!paso.mision) setAgentes([])
    hablaEstePaso.current = false
    const largo = paso.decir.length
    let porTiempo: number | undefined
    if (conVozRef.current) {
      hablaEstePaso.current = true
      void vozRef.current.decir(paso.decir)
      // Tope: si el audio no termina nunca (se cortó la conexión), sigue igual
      porTiempo = window.setTimeout(siguiente, largo * 110 + 10000)
    } else {
      // Sin voz: el tiempo de leer el subtítulo
      porTiempo = window.setTimeout(siguiente, Math.max(5000, largo * 60))
    }
    return () => window.clearTimeout(porTiempo)
  }, [indice, paso, salir, siguiente])

  // Al terminar de hablar el paso (la voz pasa de hablando a callada), una pausa corta y al siguiente.
  // Solo mira los cambios de `hablando`: "decir" lo prende en el acto, así que el próximo apagado es el final.
  useEffect(() => {
    if (voz.hablando || !hablaEstePaso.current || indiceRef.current == null) return
    hablaEstePaso.current = false
    const t = window.setTimeout(siguiente, 1200)
    return () => window.clearTimeout(t)
  }, [voz.hablando, siguiente])

  // La misión inventada: los agentes avanzan mientras dura el paso
  useEffect(() => {
    if (!paso?.mision) return
    const inicio = Date.now()
    setAgentes(agentesDemo(0, inicio))
    const t = window.setInterval(() => setAgentes(agentesDemo((Date.now() - inicio) / 1000, inicio)), 500)
    return () => window.clearInterval(t)
  }, [paso])

  return {
    activo: indice != null,
    paso,
    numero: indice != null ? indice + 1 : 0,
    total: pasos.length,
    agentes,
    iniciar,
    siguiente,
    anterior,
    salir,
  }
}
