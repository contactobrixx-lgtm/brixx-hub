import { useEffect, useState } from 'react'
import { BarChart3, Clock, MessageCircle, PackageOpen, Play, Smartphone, type LucideIcon } from 'lucide-react'
import type { Cotizacion, CotizacionItem } from '../../types/db'
import { LogoMark } from '../../components/layout/Logo'
import { formatFechaLarga } from '../../lib/format'
import { totalesCotizacion } from '../finanzas/calculos'
import type { VideoPropuesta } from './useCotizador'
import './propuesta.css'

type ConCliente = Cotizacion & { prospectos?: { nombre: string; empresa: string | null } | null }

/** Cómo mostrar el video: en pantalla se reproduce; en el PDF queda la imagen con el link (se toca y abre). */
export function videoDe(url: string): { tipo: 'iframe' | 'video' | 'enlace'; src: string; link: string; poster: string | null } {
  const abs = new URL(url, window.location.origin)
  const yt = /youtu\.be\/([\w-]{6,})|youtube\.com\/(?:watch\?v=|shorts\/|embed\/)([\w-]{6,})/.exec(url)
  if (yt) {
    const id = yt[1] ?? yt[2]
    return { tipo: 'iframe', src: `https://www.youtube.com/embed/${id}`, link: abs.href, poster: `https://img.youtube.com/vi/${id}/hqdefault.jpg` }
  }
  const propio = abs.origin === window.location.origin
  if (/\.mp4$/i.test(abs.pathname)) return { tipo: 'video', src: abs.href, link: abs.href, poster: propio ? abs.pathname.replace(/\.mp4$/i, '.jpg') : null }
  // Página del hub con un video (/material/x.html): se reproduce directo el x.mp4, así llena el recuadro (dentro de un
  // iframe la página se achicaba en el iPhone). El link del PDF sigue yendo a la página.
  if (propio && /\.html?$/i.test(abs.pathname))
    return { tipo: 'video', src: abs.pathname.replace(/\.html?$/i, '.mp4'), link: abs.href, poster: abs.pathname.replace(/\.html?$/i, '.jpg') }
  return { tipo: 'enlace', src: abs.href, link: abs.href, poster: null }
}

const ICONOS: LucideIcon[] = [MessageCircle, PackageOpen, BarChart3, Smartphone, Clock]
const dos = (n: number) => String(n).padStart(2, '0')

/** "Bot de WhatsApp con IA — Califica consultas…" → "Bot de WhatsApp con IA" */
const nombreServicio = (it: CotizacionItem) => it.descripcion.split(' — ')[0]
/** Sin resumen cargado, la descripción del catálogo ("… — Califica consultas…") */
const resumenDe = (it: CotizacionItem) => it.resumen || it.descripcion.split(' — ').slice(1).join(' — ') || null

function Logo({ claro = false, className = '' }: { claro?: boolean; className?: string }) {
  return (
    <span className={`logo ${className}`}>
      <LogoMark sobreClaro={claro} /> brixx
    </span>
  )
}

function Pie({ n }: { n: number }) {
  return (
    <div className="pie">
      <Logo claro className="text-[9pt] text-tinta" />
      <span>Propuesta · {n}</span>
    </div>
  )
}

/**
 * Propuesta comercial en hojas A4 (el diseño de la propuesta de Nova): portada, el video de cómo funcionaría,
 * dónde está el cliente hoy, qué incluye cada servicio y el resumen de la inversión con las etapas y condiciones.
 * Lo que no esté cargado se omite.
 */
export function PropuestaImprimible({ c, videoHub }: { c: ConCliente; /** El video guardado del hub (si no hay video_url) */ videoHub?: VideoPropuesta | null }) {
  // En pantallas angostas (celular) las hojas A4 se achican para entrar enteras; al imprimir van a tamaño real
  const [escala, setEscala] = useState(1)
  useEffect(() => {
    // El ancho de la pantalla (no innerWidth: en el celular crece si algo se sale de la pantalla)
    const medir = () => setEscala(Math.min(1, (Math.min(document.documentElement.clientWidth, window.screen.width) - 16) / 794)) // 210 mm ≈ 794 px
    medir()
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [])
  const p = c.propuesta ?? {}
  const etapas = c.etapas ?? []
  const cliente = c.prospectos?.empresa || c.prospectos?.nombre || 'tu negocio'
  const video = c.video_url
    ? videoDe(c.video_url)
    : videoHub
      ? { tipo: 'video' as const, src: `${videoHub.src}#t=0.1`, link: videoHub.link ?? window.location.href, poster: null }
      : null
  const t = totalesCotizacion(c)
  const items = [...c.cotizacion_items].sort((a, b) => (a.etapa ?? 99) - (b.etapa ?? 99) || Number(!!a.opcional) - Number(!!b.opcional) || a.orden - b.orden)
  const plata = (n: number) => (n ? `${c.moneda} ${Math.round(n).toLocaleString('es-AR')}` : 'A definir')
  const deItem = (it: CotizacionItem) => Number(it.cantidad) * Number(it.precio_implementacion)
  const etapaDe = (it: CotizacionItem) => (it.etapa ? etapas[it.etapa - 1] : undefined)
  const pago = p.pago || (etapas.length > 1 ? '50% al aprobar cada etapa y 50% a la entrega.' : '50% al aprobar y 50% a la entrega.')
  const financiacion =
    p.financiacion ||
    (etapas.length > 1
      ? 'No hace falta invertir todo junto: cada etapa se aprueba y se paga por separado, recién cuando la anterior está andando. Si lo necesitan, lo financiamos en cuotas: consultanos.'
      : 'No hace falta pagar todo de entrada. Si lo necesitan, lo financiamos en cuotas: consultanos.')
  const conPuntos = !!(p.punto_texto || p.puntos?.length || p.objetivos?.length)
  let hoja = 1

  return (
    <div className="propuesta" style={{ '--escala': escala } as React.CSSProperties}>
      {/* Hoja A4 sin márgenes también en los navegadores que no respetan @page con nombre (Safari del iPhone) */}
      <style>{'@page { size: A4; margin: 0; }'}</style>
      {/* 1 · Portada */}
      <section className="hoja portada flex flex-col">
        <div className="flex items-center justify-between">
          <Logo className="text-[17pt]" />
          <span className="text-[8.5pt] text-tinta-gris">Propuesta comercial · {formatFechaLarga(c.fecha)}</span>
        </div>
        <div className="mt-auto">
          <h1>
            Propuesta para {cliente}
            <br />
            <span>{p.subtitulo || 'en soluciones digitales.'}</span>
          </h1>
          {c.introduccion && <p className="mt-6 max-w-[140mm] text-[11pt] leading-relaxed text-linea">{c.introduccion}</p>}
          <div className="mt-6 flex flex-wrap gap-2.5">
            {[...new Set(etapas.length ? etapas.map((e) => e.titulo) : items.filter((i) => !i.opcional).map(nombreServicio))].map((x) => (
              <span key={x} className="pastilla">
                {x}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-auto flex items-end justify-between border-t border-tinta-suave/40 pt-6">
          <div>
            <div className="text-[8.5pt] text-tinta-gris">Preparada para</div>
            <div className="mt-1 text-[11pt] font-semibold">
              {c.prospectos?.empresa ? `${c.prospectos.empresa} · ${c.prospectos.nombre}` : cliente}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[8.5pt] text-tinta-gris">Preparada por</div>
            <Logo className="mt-1 text-[12pt]" />
            {p.telefono && <div className="mt-1 text-[8.5pt] text-tinta-gris">{p.telefono}</div>}
          </div>
        </div>
      </section>

      {/* 2 · Punto de partida: dónde está el cliente hoy */}
      {conPuntos && (
        <section className="hoja">
          <div className="ojo">Punto de partida</div>
          <h2 className="titulo">
            Dónde está {cliente} <span>hoy.</span>
          </h2>
          {p.punto_texto && <p className="bajada">{p.punto_texto}</p>}
          {!!p.puntos?.length && (
            <div className="mt-6 grid grid-cols-2 gap-3.5">
              {p.puntos.map((x, k) => {
                const Icono = ICONOS[k % ICONOS.length]
                return (
                  <div key={k} className="tarjeta">
                    <span className="grid size-[8mm] place-items-center rounded-[2.2mm] bg-campo-fondo text-acento">
                      <Icono className="size-[4mm]" />
                    </span>
                    <div className="mt-3 font-semibold">{x.titulo}</div>
                    <p className="mt-1 text-[8.5pt] text-tinta-suave">{x.detalle}</p>
                  </div>
                )
              })}
            </div>
          )}
          {!!p.objetivos?.length && (
            <>
              <div className="ojo mt-9">Nuestro compromiso</div>
              <div className="tarjeta mt-3">
                <div className="font-semibold">Objetivos de la propuesta:</div>
                <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2.5 text-[9pt]">
                  {p.objetivos.map((o) => (
                    <div key={o} className="check">
                      {o}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
          {(p.plan_titulo || p.plan_texto) && (
            <div className="oscura mt-6">
              <div className="ojo text-tinta-gris">Un plan por etapas</div>
              {p.plan_titulo && <div className="mt-2 text-[11pt] font-semibold">{p.plan_titulo}</div>}
              {p.plan_texto && <p className="apagado mt-1.5 text-[8.5pt]">{p.plan_texto}</p>}
            </div>
          )}
          <Pie n={++hoja} />
        </section>
      )}

      {/* 3 · El video */}
      {video && (
        <section className="hoja">
          <div className="ojo">Cómo funcionaría</div>
          <h2 className="titulo">
            Así trabajaría {cliente} <span>con todo andando.</span>
          </h2>
          <p className="bajada">En este video te mostramos cómo funcionaría la solución completa, etapa por etapa, del lado de tus clientes y del tuyo.</p>
          {/* En pantalla se reproduce acá */}
          <div className="no-print mt-6 overflow-hidden rounded-[4.5mm] bg-noche">
            {video.tipo === 'video' ? (
              <video src={video.src} poster={video.poster ?? undefined} controls playsInline preload="metadata" className="aspect-video w-full" />
            ) : video.tipo === 'iframe' ? (
              <iframe src={video.src} title="Video de la propuesta" allow="fullscreen; autoplay" className="aspect-video w-full border-0" />
            ) : (
              <a href={video.link} target="_blank" rel="noreferrer" className="flex aspect-video items-center justify-center gap-2 text-lg font-semibold text-papel">
                <Play className="size-6" /> Ver el video
              </a>
            )}
          </div>
          {/* En el PDF, la imagen con el link */}
          <a href={video.link} target="_blank" rel="noreferrer" className="mt-6 hidden overflow-hidden rounded-[4.5mm] border border-linea bg-papel no-underline print:block">
            <div className="relative aspect-video bg-noche">
              {video.poster && <img src={video.poster} alt="" className="absolute inset-0 size-full object-cover" />}
              <span className="absolute inset-0 grid place-items-center">
                <span className="grid size-[22mm] place-items-center rounded-full bg-papel text-tinta shadow-lg">
                  <Play className="ml-1 size-[10mm] fill-current" />
                </span>
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 px-5 py-3.5 text-tinta">
              <b>Tocá para ver el video</b>
              <span className="truncate text-[8pt] text-tinta-suave">{video.link.replace(/^https?:\/\//, '')}</span>
            </div>
          </a>
          {etapas.length > 0 && (
            <div className={`mt-6 grid gap-3 ${etapas.length >= 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {etapas.map((e, n) => (
                <div key={n} className="tarjeta">
                  <div className="ojo">
                    Etapa {n + 1}
                    {e.plazo && <span className="ml-1.5 font-semibold tracking-normal text-tinta-suave normal-case">· {e.plazo}</span>}
                  </div>
                  <div className="mt-1 font-display text-[11pt] leading-tight font-bold">{e.titulo}</div>
                  {e.detalle && <p className="mt-1.5 text-[8pt] text-tinta-suave">{e.detalle}</p>}
                </div>
              ))}
            </div>
          )}
          <Pie n={++hoja} />
        </section>
      )}

      {/* 4 · Qué incluye cada servicio */}
      <section className="hoja">
        <div className="ojo">Servicios</div>
        <h2 className="titulo">
          Qué incluye <span>{etapas.length ? 'cada etapa.' : 'cada servicio.'}</span>
        </h2>
        <div className="mt-6 grid grid-cols-2 gap-3.5">
          {items.map((it, k) => {
            const e = etapaDe(it)
            return (
              <div key={it.id} className={`tarjeta flex flex-col ${it.opcional ? 'opcional-tarjeta' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="ojo">
                      {it.opcional ? 'Opcional' : dos(k + 1)}
                      {e && <span className="ml-1.5 font-semibold tracking-normal text-tinta-suave normal-case">· Etapa {it.etapa}</span>}
                    </div>
                    <h3 className="mt-1 text-[12.5pt] leading-tight font-bold">{nombreServicio(it)}</h3>
                  </div>
                  <div className="precio">
                    <div className="ojo">Inversión</div>
                    <div className="font-display text-[12pt] font-bold whitespace-nowrap">{plata(deItem(it))}</div>
                    {Number(it.precio_mensual) > 0 && (
                      <div className="text-[7pt] whitespace-nowrap text-tinta-suave">+ {plata(Number(it.cantidad) * Number(it.precio_mensual))}/mes</div>
                    )}
                  </div>
                </div>
                {resumenDe(it) && <p className="mt-3 text-[8.5pt] text-tinta-suave">{resumenDe(it)}</p>}
                {!!it.incluye?.length && (
                  <div className="mt-3 flex flex-col gap-1.5 text-[8.5pt]">
                    {it.incluye.map((x) => (
                      <div key={x} className="check">
                        {x}
                      </div>
                    ))}
                  </div>
                )}
                {it.opcional && <p className="aviso mt-3 text-[8pt]">Opcional: no está incluido en el total.{it.etapa ? ` Lo vemos juntos en la etapa ${it.etapa}.` : ' Lo vemos juntos.'}</p>}
                {it.entregable && (
                  <p className="mt-auto border-t border-linea pt-3 text-[8pt] text-tinta-suave">
                    <b className="text-tinta">Entregable:</b> {it.entregable}
                  </p>
                )}
              </div>
            )
          })}
        </div>
        <div className="oscura mt-5 flex items-center justify-between">
          <div>
            <div className="ojo text-tinta-gris">Inversión total</div>
            <div className="mt-1 text-[11pt] font-semibold">
              {etapas.length ? `Las ${etapas.length} etapas` : 'Todos los servicios'} · {items.some((i) => i.opcional) ? 'sin el opcional' : 'pago único'}
            </div>
          </div>
          <div className="text-right">
            <div className="font-display text-[22pt] leading-none font-bold">{plata(t.implementacion)}</div>
            {t.mensual > 0 && <div className="apagado mt-1 text-[8pt]">+ {plata(t.mensual)} / mes de mantenimiento</div>}
          </div>
        </div>
        <Pie n={++hoja} />
      </section>

      {/* 5 · Resumen de la inversión y forma de pago (con financiación, en grande) */}
      <section className="hoja">
        <div className="ojo">Inversión</div>
        <h2 className="titulo">
          Resumen <span>de la propuesta.</span>
        </h2>
        <div className="tarjeta mt-6 overflow-hidden p-0">
          <table>
            <thead>
              <tr className="text-[6.5pt] font-bold tracking-[0.18em] text-tinta-suave uppercase">
                <th>Servicio</th>
                <th className="text-right">Inversión</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, k) => (
                <tr key={it.id} className={`border-t border-linea ${it.opcional ? 'text-tinta-suave' : ''}`}>
                  <td>
                    <span className="mr-3 text-[8pt] font-bold text-acento">{it.opcional ? 'OP' : dos(k + 1)}</span>
                    {nombreServicio(it)}
                    {it.etapa && <span className="ml-2 text-[8pt] text-tinta-suave">· Etapa {it.etapa}</span>}
                    {it.opcional && <span className="ml-2 text-[7.5pt] font-semibold text-aviso-papel-texto">Opcional, no suma</span>}
                  </td>
                  <td className="text-right font-semibold whitespace-nowrap">{plata(deItem(it))}</td>
                </tr>
              ))}
              {t.descuento > 0 && (
                <tr className="border-t border-linea text-tinta-suave">
                  <td>Descuento ({Number(c.descuento_pct)}%)</td>
                  <td className="text-right whitespace-nowrap">− {plata(t.descuento)}</td>
                </tr>
              )}
              <tr className="bg-noche text-papel">
                <td className="font-semibold">Total · {etapas.length ? `${etapas.length} etapas` : 'pago único'}</td>
                <td className="text-right font-display text-[14pt] font-bold whitespace-nowrap">{plata(t.implementacion)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Forma de pago en grande: que se note que no hay que pagar todo junto */}
        <div className="pago mt-5">
          <div className="ojo">Forma de pago · Financiación</div>
          <div className="mt-2 font-display text-[17pt] leading-tight font-bold">{pago}</div>
          <p className="mt-2.5 text-[9.5pt] text-tinta-suave">{financiacion}</p>
          {etapas.length > 1 && (
            <div className={`mt-4 grid gap-2.5 ${etapas.length >= 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {etapas.map((e, n) => {
                const total = items.filter((i) => i.etapa === n + 1 && !i.opcional).reduce((a, i) => a + deItem(i), 0)
                return (
                  <div key={n} className="rounded-[3mm] bg-papel px-3.5 py-2.5">
                    <div className="text-[7pt] font-bold tracking-[0.15em] text-tinta-suave uppercase">Etapa {n + 1}</div>
                    <div className="mt-0.5 text-[8.5pt] leading-snug font-semibold">{e.titulo}</div>
                    {total > 0 && <div className="mt-1 text-[8pt] text-tinta-suave">2 pagos de {plata(total / 2)}</div>}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3.5">
          <div className="oscura">
            <div className="ojo text-tinta-gris">Mantenimiento mensual</div>
            <div className="mt-2 font-display text-[18pt] font-bold">
              {t.mensual > 0 ? plata(t.mensual) : 'A definir'} <span className="apagado text-[9pt] font-normal">/ mes</span>
            </div>
            {!!p.mantenimiento?.length && (
              <div className="mt-2 flex flex-col gap-1 text-[8pt]">
                {p.mantenimiento.map((m) => (
                  <div key={m}>— {m}</div>
                ))}
              </div>
            )}
            {p.mantenimiento_nota && <p className="apagado mt-2 text-[7.5pt]">{p.mantenimiento_nota}</p>}
          </div>
          {p.aviso && (
            <div className="aviso">
              <div className="ojo text-aviso-papel-texto">Para tener en cuenta</div>
              <div className="mt-2 font-semibold text-tinta">{p.aviso.titulo}</div>
              <p className="mt-1.5 text-[8pt]">{p.aviso.texto}</p>
            </div>
          )}
        </div>
        <Pie n={++hoja} />
      </section>

      {/* 6 · Conclusión: qué logra, el plan por etapas, condiciones y el cierre */}
      <section className="hoja flex flex-col">
        <div className="ojo">Cierre de la propuesta</div>
        <h2 className="titulo">
          Conclusión <span>de la propuesta.</span>
        </h2>
        {(p.conclusion || c.introduccion) && <p className="bajada text-[10.5pt] leading-relaxed text-tinta">{p.conclusion || c.introduccion}</p>}
        {!!p.objetivos?.length && (
          <div className="tarjeta mt-6">
            <div className="font-semibold">Lo que {cliente} va a lograr:</div>
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2.5 text-[9pt]">
              {p.objetivos.map((o) => (
                <div key={o} className="check">
                  {o}
                </div>
              ))}
            </div>
          </div>
        )}
        {etapas.length > 0 && (
          <>
            <div className="ojo mt-7">Cómo crece el plan</div>
            <div className={`mt-3 grid gap-3 ${etapas.length >= 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {etapas.map((e, n) => (
                <div key={n} className={`tarjeta ${n === 0 ? 'border-2 border-acento' : ''}`}>
                  <div className="ojo">
                    Etapa {n + 1}
                    {n === 0 ? ' · Primero' : ''}
                  </div>
                  <div className="mt-1 font-semibold">{e.titulo}</div>
                  {e.plazo && <div className="mt-1 text-[8pt] text-tinta-suave">{e.plazo}</div>}
                  {e.detalle && <p className="mt-1.5 text-[8pt] text-tinta-suave">{e.detalle}</p>}
                </div>
              ))}
            </div>
          </>
        )}
        <div className="mt-4 grid grid-cols-2 gap-3">
          {[
            ['Moneda', p.moneda_texto || (c.moneda === 'USD' ? 'Valores en USD, se pueden abonar en pesos al cambio del día de pago.' : 'Valores en pesos argentinos.')],
            ['Validez', p.validez ?? (c.valida_hasta ? `Válida hasta el ${formatFechaLarga(c.valida_hasta)}.` : undefined)],
          ]
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="tarjeta">
                <div className="ojo text-tinta-suave">{k}</div>
                <p className="mt-1.5 text-[8.5pt]">{v}</p>
              </div>
            ))}
        </div>

        {/* Cierre: queda arriba del pie, nunca encima */}
        <div className="cierre mt-auto mb-[16mm]">
          <div className="ojo text-tinta-gris">¿Arrancamos?</div>
          <div className="mt-2 font-display text-[20pt] leading-tight font-bold">{p.cierre || 'Empecemos por las bases.'}</div>
          <div className="mt-5 flex items-end justify-between gap-6 border-t border-tinta-suave/40 pt-4">
            <div className="apagado text-[9pt]">
              {p.telefono ? (
                <>
                  Escribinos al <b className="text-papel">{p.telefono}</b> y coordinamos el arranque.
                </>
              ) : (
                'Respondé este mensaje y coordinamos el arranque.'
              )}
            </div>
            <div className="text-right">
              <Logo className="text-[16pt]" />
              <div className="apagado mt-1 text-[6.5pt] tracking-[0.2em] uppercase">Soluciones digitales</div>
            </div>
          </div>
        </div>
        <Pie n={++hoja} />
      </section>
    </div>
  )
}
