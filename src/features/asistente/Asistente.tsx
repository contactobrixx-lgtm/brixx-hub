import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AudioLines, Mic, Send, Square, Trash2, Volume2, VolumeX } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Field'
import { Spinner } from '../../components/ui/Spinner'
import { cn } from '../../components/ui/cn'
import { useReconocimientoVoz } from './useReconocimientoVoz'
import { useVoz } from './useVoz'
import { useAsistente } from './useAsistente'

const SUGERENCIAS = [
  '¿Qué tengo pendiente?',
  'Resumime la última reunión',
  '¿Cuántas reuniones grabé esta semana?',
  '¿Cómo vamos con la meta del mes?',
]

const CLAVE_VOZ = 'brixx-asistente-voz'

function leerVozActiva(): boolean {
  try {
    return localStorage.getItem(CLAVE_VOZ) !== 'no'
  } catch {
    return true
  }
}

/** Botón flotante + panel del asistente de voz. Va en todas las pantallas del hub. */
export function Asistente() {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [vozActiva, setVozActiva] = useState(leerVozActiva)
  const voz = useVoz()
  const { mensajes, pensando, preguntar, limpiar } = useAsistente()
  const lista = useRef<HTMLDivElement>(null)

  const enviar = async (pregunta: string) => {
    if (!pregunta.trim() || pensando) return
    setTexto('')
    voz.callar()
    const respuesta = await preguntar(pregunta)
    if (respuesta && vozActiva) voz.decir(respuesta)
  }

  const microfono = useReconocimientoVoz((dicho) => enviar(dicho))

  // Bajar al último mensaje
  useEffect(() => {
    lista.current?.scrollTo({ top: lista.current.scrollHeight, behavior: 'smooth' })
  }, [mensajes, pensando, microfono.parcial])

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_VOZ, vozActiva ? 'si' : 'no')
    } catch {
      /* sin almacenamiento: queda solo para esta pantalla */
    }
  }, [vozActiva])

  const tocarMicrofono = () => {
    voz.destrabar()
    voz.callar()
    if (microfono.escuchando) microfono.terminar()
    else microfono.escuchar()
  }

  const abrirYEscuchar = () => {
    setAbierto(true)
    voz.destrabar()
    voz.callar()
    if (microfono.disponible && !pensando) microfono.escuchar()
  }

  const cerrar = () => {
    microfono.cancelar()
    voz.callar()
    setAbierto(false)
  }

  const enviarTexto = (e: FormEvent) => {
    e.preventDefault()
    voz.destrabar()
    enviar(texto)
  }

  return (
    <>
      {/* Botón flotante */}
      {!abierto && (
        <button
          onClick={abrirYEscuchar}
          className="fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 grid size-14 cursor-pointer place-items-center rounded-full bg-acento text-white shadow-xl ring-4 ring-fondo transition-transform hover:bg-acento-fuerte active:scale-95 md:right-6 md:bottom-6"
          aria-label="Hablar con el asistente"
          title="Asistente"
        >
          <AudioLines className="size-6" />
        </button>
      )}

      <Modal
        abierto={abierto}
        onCerrar={cerrar}
        titulo="Asistente"
        pie={
          <div className="flex w-full flex-col gap-2">
            {microfono.escuchando && (
              <p className="min-h-5 text-sm text-acento-claro" aria-live="polite">
                {microfono.parcial || 'Te escucho…'}
              </p>
            )}
            <form onSubmit={enviarTexto} className="flex items-center gap-2">
              {microfono.disponible && (
                <button
                  type="button"
                  onClick={tocarMicrofono}
                  disabled={pensando}
                  className={cn(
                    'grid size-12 shrink-0 cursor-pointer place-items-center rounded-full text-white transition-transform active:scale-95 disabled:opacity-50',
                    microfono.escuchando ? 'animate-pulse bg-peligro' : 'bg-acento hover:bg-acento-fuerte',
                  )}
                  aria-label={microfono.escuchando ? 'Terminar y preguntar' : 'Hablar'}
                  title={microfono.escuchando ? 'Terminar y preguntar' : 'Hablar'}
                >
                  {microfono.escuchando ? <Square className="size-5 fill-current" /> : <Mic className="size-5" />}
                </button>
              )}
              <Input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder={microfono.disponible ? 'O escribí tu pregunta…' : 'Escribí tu pregunta…'}
                disabled={microfono.escuchando}
                aria-label="Pregunta"
              />
              <Button type="submit" size="icono" className="size-11" disabled={!texto.trim() || pensando} aria-label="Enviar">
                <Send className="size-4" />
              </Button>
            </form>
          </div>
        }
      >
        {/* Controles de voz */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {voz.disponible && (
            <Button size="sm" variant="secundario" onClick={() => setVozActiva((v) => !v)} aria-pressed={vozActiva}>
              {vozActiva ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
              {vozActiva ? 'Respuestas con voz' : 'Voz apagada'}
            </Button>
          )}
          {voz.hablando && (
            <Button size="sm" variant="peligro" onClick={voz.callar}>
              <Square className="size-3.5 fill-current" /> Frenar lectura
            </Button>
          )}
          {mensajes.length > 0 && (
            <Button size="sm" variant="fantasma" className="ml-auto" onClick={limpiar} aria-label="Borrar conversación">
              <Trash2 className="size-4" /> Borrar
            </Button>
          )}
        </div>

        {!microfono.disponible && (
          <p className="mb-4 rounded-[10px] bg-acento-tenue px-3.5 py-3 text-sm text-acento-claro">
            Este navegador no permite dictar por voz. Podés escribir la pregunta abajo; si querés hablarle, usá Chrome o Safari.
          </p>
        )}
        {microfono.error && <p className="mb-4 rounded-[10px] bg-aviso-tenue px-3.5 py-3 text-sm text-aviso">{microfono.error}</p>}

        <div ref={lista} className="flex flex-col gap-3" aria-live="polite">
          {mensajes.length === 0 && !pensando && (
            <div>
              <p className="mb-3 text-tenue">Preguntame por tus reuniones, clientes, pendientes o metas. Por ejemplo:</p>
              <div className="flex flex-wrap gap-2">
                {SUGERENCIAS.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      voz.destrabar()
                      enviar(s)
                    }}
                    className="cursor-pointer rounded-full border border-borde-fuerte px-3 py-1.5 text-left text-sm text-suave hover:border-tenue hover:text-texto"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {mensajes.map((m) => (
            <div key={m.id} className={cn('flex', m.rol === 'usuario' ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed',
                  m.rol === 'usuario' && 'rounded-br-md bg-acento-tenue text-acento-claro',
                  m.rol === 'asistente' && !m.error && 'rounded-bl-md bg-elevada',
                  m.error && 'rounded-bl-md bg-peligro-tenue text-peligro',
                )}
              >
                <p className="whitespace-pre-line">{m.texto}</p>
                {m.rol === 'asistente' && !m.error && voz.disponible && (
                  <button
                    onClick={() => voz.decir(m.texto)}
                    className="mt-1 inline-flex cursor-pointer items-center gap-1 text-xs text-tenue hover:text-texto"
                    aria-label="Escuchar de nuevo"
                  >
                    <Volume2 className="size-3.5" /> Escuchar
                  </button>
                )}
              </div>
            </div>
          ))}

          {pensando && (
            <div className="flex items-center gap-2 text-sm text-tenue">
              <Spinner className="size-4" /> Pensando…
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}
