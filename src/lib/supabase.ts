import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigurado = Boolean(url && anonKey)

// Si faltan las variables se crea un cliente "vacío" y la app muestra un aviso
// (ver App.tsx) en vez de romper con pantalla en blanco.
export const supabase = createClient(
  url ?? 'https://falta-configurar.supabase.co',
  anonKey ?? 'falta-configurar',
)

export const BUCKET_CAPTURAS = 'capturas'
