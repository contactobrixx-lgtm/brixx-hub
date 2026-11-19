import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { BusquedaJarvis, LugarBusqueda } from '../../types/db'

/** Centro de brixx: San Miguel de Tucumán (Yerba Buena queda al oeste, al pie del cerro). */
export const CENTRO_BASE = { lat: -26.8241, lng: -65.2226, zoom: 12.6, titulo: 'San Miguel de Tucumán' }

/** Una búsqueda de negocios de Jarvis (jarvis_busquedas). `version` fuerza a releerla cuando Jarvis la completa. */
export function useBusqueda(id: string | null | undefined, version = 0) {
  const [busqueda, setBusqueda] = useState<BusquedaJarvis | null>(null)
  const [error, setError] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    if (!id) {
      setBusqueda(null)
      return
    }
    const { data, error } = await supabase.from('jarvis_busquedas').select('*').eq('id', id).maybeSingle()
    if (error) setError(error.message)
    else {
      setBusqueda((data as BusquedaJarvis | null) ?? null)
      setError(null)
    }
  }, [id])

  useEffect(() => {
    recargar()
  }, [recargar, version])

  /**
   * Suma un lugar al pipeline como prospecto en "contacto" y lo marca en la búsqueda.
   * Si ya hay un prospecto con ese nombre (por ejemplo, de otra búsqueda), no lo duplica: lo vincula.
   */
  const sumarAlPipeline = async (indice: number): Promise<{ id: string; yaEstaba: boolean }> => {
    if (!busqueda) throw new Error('No hay búsqueda abierta.')
    const l = busqueda.lugares[indice]
    if (!l) throw new Error('No encontré ese lugar.')
    if (l.prospecto_id) return { id: l.prospecto_id, yaEstaba: true }
    // ¿Ya está? (mismo nombre, sin importar mayúsculas)
    const exacto = l.nombre.replace(/[%_\\]/g, (c) => `\\${c}`)
    const { data: previo } = await supabase.from('prospectos').select('id').or(`empresa.ilike.${JSON.stringify(exacto)},nombre.ilike.${JSON.stringify(exacto)}`).limit(1).maybeSingle()
    let id = (previo?.id as string | undefined) ?? null
    const yaEstaba = !!id
    if (!id) {
      const detalle = [l.direccion && `Dirección: ${l.direccion}`, l.rating != null && `Google: ${l.rating} (${l.resenas ?? 0} reseñas)`, l.maps && `Google Maps: ${l.maps}`, l.horario && `Horario: ${l.horario}`, l.nota]
        .filter(Boolean)
        .join('\n')
      const { data, error } = await supabase
        .from('prospectos')
        .insert({
          nombre: l.nombre,
          empresa: l.nombre,
          rubro: busqueda.rubro,
          telefono: l.telefono ?? null,
          instagram: l.instagram ?? null,
          web: l.web && !l.instagram ? l.web : null,
          etapa: 'contacto',
          notas: `Encontrado por Jarvis buscando ${busqueda.rubro} en ${busqueda.zona}.${detalle ? `\n${detalle}` : ''}`,
        })
        .select('id')
        .single()
      if (error) throw new Error(error.message)
      id = data.id as string
    }
    const lugares: LugarBusqueda[] = busqueda.lugares.map((x, i) => (i === indice ? { ...x, prospecto_id: id } : x))
    const { error: e2 } = await supabase.from('jarvis_busquedas').update({ lugares }).eq('id', busqueda.id)
    if (e2) console.warn('No se pudo marcar en la búsqueda:', e2.message) // el prospecto ya quedó creado
    setBusqueda({ ...busqueda, lugares })
    return { id, yaEstaba }
  }

  return { busqueda, error, recargar, sumarAlPipeline }
}

/** La clave pública de MapTiler (ajustes.mapa_clave). Sin clave, el mapa va sin satélite. */
export function useClaveMapa() {
  const [clave, setClave] = useState<string | null>(null)
  const [disponible, setDisponible] = useState(true)
  const [cargada, setCargada] = useState(false)

  useEffect(() => {
    supabase
      .from('ajustes')
      .select('*')
      .maybeSingle()
      .then(({ data, error }) => {
        if (!error && data && !('mapa_clave' in data)) setDisponible(false) // la base todavía no tiene el campo
        setClave(((data?.mapa_clave as string | null) ?? '').trim() || null)
        setCargada(true)
      })
  }, [])

  const guardar = async (nueva: string) => {
    const limpia = nueva.trim() || null
    const { error } = await supabase.from('ajustes').upsert({ id: true, mapa_clave: limpia })
    if (error) throw new Error(error.message)
    setClave(limpia)
  }

  return { clave, disponible, cargada, guardar }
}

/** Link de WhatsApp a partir de un teléfono argentino como venga escrito ("0381 15-555-1234", "+54 9 381…"). */
export function whatsapp(telefono: string): string | null {
  let n = telefono.replace(/\D/g, '')
  if (!n) return null
  if (n.startsWith('54')) n = n.slice(2)
  if (n.startsWith('0')) n = n.slice(1)
  if (n.startsWith('9')) n = n.slice(1)
  // 381 15 5551234 → 381 5551234 (en WhatsApp va sin el 15)
  n = n.replace(/^(\d{2,4})15(\d{6,8})$/, '$1$2')
  if (n.length !== 10) return null
  return `https://wa.me/549${n}`
}

/** Link a Instagram a partir de "@usuario", "usuario" o la URL completa. */
export function linkInstagram(ig: string): string {
  const t = ig.trim()
  if (/^https?:\/\//i.test(t)) return t
  return `https://www.instagram.com/${t.replace(/^@/, '').replace(/\/$/, '')}/`
}
