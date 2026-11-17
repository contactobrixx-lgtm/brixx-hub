/**
 * iPhone/iPad: después de usar el micrófono, Safari deja el audio en modo "llamada" (sale bajito,
 * como por el auricular). Con la Audio Session API (Safari 16.4+) se le indica qué estamos haciendo:
 * "playback" para que Jarvis hable fuerte por el parlante, "play-and-record" mientras escucha.
 * En los navegadores que no la tienen, no hace nada.
 */
export function modoAudio(tipo: 'playback' | 'play-and-record' | 'auto') {
  try {
    const sesion = (navigator as unknown as { audioSession?: { type: string } }).audioSession
    if (sesion && sesion.type !== tipo) sesion.type = tipo
  } catch {
    /* navegador sin Audio Session API */
  }
}
