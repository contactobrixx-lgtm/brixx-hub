# Brixx Hub

Panel interno de **brixx**, agencia de IA de dos socios. Centraliza en un solo lugar:

1. **Inicio**: metas del mes y del trimestre (cuenta regresiva, ritmo, embudo al revés) + dashboard del estudio en USD (cobrado, costos, margen, ingreso recurrente, por cobrar, ROAS, pendientes, próximas reuniones).
2. **Calendario**: reuniones agendadas + próximas acciones del pipeline.
3. **Pipeline**: kanban de prospectos y clientes (de contacto a mantenimiento).
4. **Clientes**: una carpeta por cliente y cliente potencial (datos, Instagram, web, rubro, industria, objetivos y soluciones que les proponemos) + **intervenciones**: después de hablar con un cliente se carga un audio, un texto y/o sus links, y Claude devuelve dolores, cuellos de botella, soluciones/servicios y una propuesta para mandarle. Si el cliente no tiene carpeta, se crea sola.
5. **Cotizador**: catálogo de servicios con precio de implementación y abono mensual, y cotizaciones por cliente con versión imprimible/PDF.
6. **Finanzas**: cobros, costos del estudio y tipo de cambio.
7. **Grabaciones**: reuniones grabadas con el celular (o audios subidos, como notas de voz de WhatsApp) → transcripción (AssemblyAI) + análisis con Claude (puntos clave, próximos pasos, propuesta con el catálogo).
8. **Jarvis** (`/jarvis`): centro de comando con núcleo animado, estado, resumen, feed del día, agenda de hoy, comandos rápidos y modo manos libres ("Jarvis, …"). Más el **asistente de voz** como botón flotante en el resto de las pantallas. Dictado con la Web Speech API (es-AR), respuesta de Claude por la Edge Function `asistente` (con herramientas de solo lectura sobre todo el hub), lectura en voz alta con ElevenLabs (Edge Function `voz`) o, si no está, `speechSynthesis`.
9. **Sistemas de gestión** y **Demos web**: fichas de las apps entregadas y de las demos (cada una con su URL; el hub las lista y las abre).

Usuarios: solo los dos socios, invitados manualmente desde Supabase. No hay registro público.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 19 + Vite + TypeScript |
| Estilos | Tailwind CSS v4 (tema oscuro único, tokens en `src/index.css` → `@theme`) |
| Ruteo | React Router |
| Datos / Auth | Supabase (Postgres + Auth con email/contraseña + Row Level Security + Storage) |
| Kanban | @dnd-kit/core (drag & drop) |
| Íconos | lucide-react |
| Marca | `components/layout/Logo.tsx` (isotipo SVG) · `public/brixx-logo.png` (original) |
| Deploy | Vercel (build automático desde GitHub) |

El frontend habla directo con Supabase usando la clave pública (anon/publishable). **La seguridad la dan las políticas RLS**, no el frontend. La única parte de servidor son las **Edge Functions `grabaciones`, `asistente` y `voz`** (Deno, en `supabase/functions/`), que guardan las claves de terceros (AssemblyAI, Anthropic, ElevenLabs) como *secrets* de Supabase: **nunca van al frontend, al repo ni a Vercel**.

## Flujo de trabajo (regla fija)

Cada cambio, sin excepción:

1. Se trabaja en una rama y se **abre un Pull request** contra `main`.
2. Se le pasa al usuario el **link del PR** y el **link de preview de Vercel**. El bot de Vercel lo deja en un comentario del PR o en el check "Vercel".
3. **No se mergea hasta que el usuario diga "ok".** Con el "ok", Claude mergea el PR (merge commit). Después confirma que el workflow "Migraciones de Supabase" terminó bien si el PR traía migraciones.
4. Si el PR se mergea, el trabajo siguiente sale de una rama nueva desde `main` actualizado.

## Migraciones automáticas

- `.github/workflows/migraciones.yml` + `.github/scripts/aplicar-migraciones.sh`: en cada PR **simula** (lista las pendientes); al mergear a `main` **aplica** con `supabase db push` (Supabase CLI fijada en 3.1.0). También se puede correr a mano desde Actions.
- Usa el secret `SUPABASE_DB_URL`: URI del **Session pooler**, porque GitHub es solo IPv4.
- La 0001 se corrió a mano: si sus tablas existen y no está en `supabase_migrations.schema_migrations`, el script la marca como aplicada (`migration repair`) sin volver a correrla.
- **Nunca** pedirle al usuario que corra SQL a mano ni editar una migración ya aplicada. Todo cambio de base es un archivo nuevo `NNNN_descripcion.sql` (siguiente número), idempotente, probado antes contra un Postgres local.
- Las Edge Functions se publican con `.github/workflows/funciones.yml` al mergear cambios en `supabase/functions/` (secret `SUPABASE_ACCESS_TOKEN`; el id del proyecto sale de `SUPABASE_DB_URL`). Se publican con `--no-verify-jwt`: la función valida ella misma la sesión (`es_miembro()`) y el aviso firmado (HMAC) del proveedor de transcripción.
- Las previews de Vercel usan la base de producción. Un PR con migración nueva puede fallar en preview en lo que dependa de esas tablas hasta mergearlo; avisarle al usuario.

## Variables de entorno

Definidas en `.env.local` (local, no se commitea) y en Vercel → Settings → Environment Variables:

```
VITE_SUPABASE_URL=https://<proyecto>.supabase.co
VITE_SUPABASE_ANON_KEY=<clave pública anon / publishable>
```

Nunca usar ni commitear la `service_role` / secret key en este repo.

## Estructura de carpetas (objetivo)

```
src/
  lib/supabase.ts        # cliente único de Supabase
  lib/format.ts          # etiquetas, montos, fechas, conversión a USD
  lib/useTabla.ts        # CRUD genérico sobre una tabla (base de los hooks de cada feature)
  auth/                  # AuthProvider (sesión + miembro), RequireAuth
  components/ui/         # Button, Field/Input/Select, Modal, Badge... (reutilizables)
  components/layout/     # AppLayout (sidebar + nav móvil), PageHeader, Logo
  features/
    inicio/              # useDashboard (todos los cálculos del dashboard), GraficoMensual, metas.ts (cálculo puro de metas), MetasPanel, MetasForm
    calendario/          # useReuniones, MesGrid, Agenda, ReunionForm, eventos (reuniones + acciones)
    cotizador/           # useServicios, useCotizaciones, CotizacionForm, ServicioForm
    finanzas/            # useCobros, useCostos, useAjustes, calculos.ts, CobroForm, CostoForm, TipoCambio
    fichas/              # useFichas, FichaCard, FichaForm, ImagenPicker (sistemas + demos)
    pipeline/            # useProspectos, Tablero (kanban), ProspectoCard, ProspectoForm, etapas.ts
    grabaciones/         # useGrabadora (MediaRecorder + copia en IndexedDB), useGrabaciones, IntervencionForm, VistaAnalisis (reuniones), VistaIntervencion, MensajeParaEnviar, VistaTranscripcion
    clientes/            # useClientes (historia por cliente, síntesis), LinksCliente
    asistente/           # Asistente (botón flotante + panel), useReconocimientoVoz (tocar para hablar), useManosLibres ("Jarvis…"), useVoz (ElevenLabs o speechSynthesis), useAsistente, Nucleo (orbe animado)
  pages/                 # una página por ruta
  types/db.ts            # tipos de las tablas de la base
supabase/
  migrations/            # SQL versionado: esquema, RLS, seeds
  functions/grabaciones/ # Edge Function: index.ts (rutas), transcripcion.ts (AssemblyAI), analisis.ts (reuniones), intervencion.ts (intervenciones + carpeta del cliente), sintesis.ts (resumen de la carpeta)
  functions/asistente/   # Edge Function: index.ts (auth + entrada), datos.ts (consultas de solo lectura + panorama de hoy), herramientas.ts (tools), cerebro.ts (bucle con Claude)
  functions/voz/         # Edge Function: texto → audio con ElevenLabs (opcional)
```

## Rutas

- `/login` — única ruta pública (incluye "olvidé mi contraseña").
- `/nueva-clave` — cambiar contraseña (también destino del link de recuperación).
- `/inicio` — dashboard (ruta por defecto).
- `/calendario` — mes + próximos.
- `/cotizador` (`?vista=servicios`) — cotizaciones y catálogo de servicios.
- `/cotizaciones/:id/imprimir` — cotización en papel blanco para imprimir o guardar PDF (fuera del layout).
- `/finanzas` (`?vista=costos`) — cobros, costos y tipo de cambio.
- `/grabar` (`?reunion=<id>`) — grabadora; `/grabaciones` — lista; `/grabaciones/:id` — "Lo importante" + transcripción.
- `/sistemas`, `/demos` — grilla de fichas filtrada por `seccion`.
- `/jarvis` — centro de comando de voz. El asistente del resto de las pantallas no tiene ruta: es un botón flotante en `AppLayout` (oculto en `/grabar` y `/jarvis`).
- `/ver/:id` — ficha abierta embebida en iframe (con botón "abrir en pestaña nueva").
- `/pipeline` — kanban de prospectos.
- `/clientes` — carpetas de clientes (filtros Todos/Potenciales/Clientes/Perdidos + búsqueda); `/clientes/:id` — carpeta: objetivos, soluciones, hacé ahora, datos e intervenciones.

## Convenciones

- **Idioma**: UI, nombres de tablas/columnas y textos en **español**. Código (variables, funciones, componentes) en inglés o español, pero consistente dentro de cada archivo; nombres de tablas/columnas siempre como están en la base.
- **Datos, no código**: todo contenido (fichas, prospectos, servicios, cotizaciones, cobros, costos, reuniones, grabaciones) vive en Supabase y se edita desde formularios del hub. Nunca hardcodear fichas en el código.
- **Etapas**: `contacto → reunion → demo → propuesta` (abiertas) → `cerrado → implementacion → mantenimiento` (ganadas) / `perdido`. Un **cliente** es un prospecto en etapa ganada; no hay tabla aparte. Constantes `ETAPAS_ABIERTAS`, `ETAPAS_GANADAS`, `ETAPAS_ACTIVAS` en `types/db.ts`.
- **Dinero**: cada monto se guarda con su `moneda` (ARS | USD). El dashboard muestra **todo en USD**, convirtiendo ARS con `ajustes.tipo_cambio_usd` (ARS por 1 USD) vía `aUSD()`. Si falta el tipo de cambio, lo ARS no se suma y aparece un pendiente.
- **Cotizaciones**: los precios del catálogo (`servicios`) están en USD. Cada ítem copia el precio al agregarse (snapshot): cambiar el catálogo no altera cotizaciones viejas. El descuento aplica solo a la implementación. Al guardar una cotización como `aceptada`, el prospecto pasa a `cerrado` (si estaba abierto) y su `valor_estimado` toma el total.
- **Metas** (tabla `metas`, una fila por `tipo` mes|trimestre + `periodo` = primer día): `clientes_nuevos` cuenta prospectos ganados con `fecha_cierre` dentro del período (`fecha_cierre` la pone/saca un trigger al entrar/salir de etapas ganadas); `ingreso_recurrente` compara el ingreso recurrente de hoy contra la meta al cierre. Ritmo = proyección lineal de cierres. Embudo al revés: faltan clientes ÷ tasa propuesta→cierre = propuestas; ÷ tasa reunión→propuesta = reuniones; repartido por semanas restantes. Tasas reales con ≥5 casos, si no las de `ajustes` (editables en el formulario de metas). Todo el cálculo está en `features/inicio/metas.ts`.
- **Abonos esperados**: cada cliente en `mantenimiento` con cotización aceptada con abono espera un cobro `abono` por mes; si falta, aparece en Pendientes y abre el cobro prellenado (`/finanzas?registrar=abono&prospecto=…&monto=…&moneda=…`).
- **Por cobrar** = implementación de cotizaciones aceptadas − cobros no-abono del cliente. **Ingreso recurrente** = abonos de cotizaciones aceptadas de clientes activos.
- **Costos**: `mensual` cuenta cada mes entre `desde` y `hasta`; `anual` cuenta 1/12 por mes; `unico` solo en el mes de `desde`. Categoría `adquisicion` alimenta el ROAS.
- **Clientes e intervenciones**: la carpeta de un cliente es su fila de `prospectos` (no hay tabla aparte), con `instagram`, `web`, `industria` y `sintesis` (+ `sintesis_at`). Una **intervención** es una fila de `grabaciones` con `origen` = `audio` (archivo subido) | `texto` (chat, mail o notas en `texto_original`), más `urls` (links del cliente); las reuniones grabadas son `origen = reunion`. Se cargan con `IntervencionForm` (desde `/clientes`, la carpeta o `/grabaciones`). La función `grabaciones`: un `texto` pasa directo al análisis (el texto va como único segmento); un `audio` se transcribe primero. `intervencion.ts` lee los links (título, descripción y texto, solo hosts públicos, 8 s), analiza con `ESQUEMA_INTERVENCION` (en sincronía con `AnalisisIntervencion`, marcado con `tipo: 'intervencion'`) y busca la carpeta (por mail, Instagram, web o nombre comparable) o la **crea** en `contacto`, completando solo los datos vacíos. Después de cada análisis con cliente (intervención o reunión) se re-arma `prospectos.sintesis` (`sintesis.ts`: situación, objetivos, soluciones, hacé ahora, falta saber; también a mano con `{accion: 'sintesis', prospecto_id}`). Audios viejos con `lo_que_quiere`/`respuesta_sugerida` se siguen mostrando. El tipo del archivo se deduce por extensión (`.opus` → `audio/ogg`) y se re-etiqueta el Blob, porque Storage toma el tipo del archivo y no la opción `contentType`.
- **Grabaciones**: estados `pendiente → transcribiendo → analizando → lista` (o `error` con motivo). Sin claves cargadas, todo queda `pendiente` y se procesa después con el botón de la grabación: la app tiene que funcionar sin las claves. El aviso del proveedor llega por webhook; si no llega, el hub consulta (`actualizar`) mientras la página está abierta. Audio en bucket privado `grabaciones`, se borra a los 90 días (el hub lo limpia al listar). El análisis usa `claude-opus-5-5` con `output_config.format` (JSON schema `ESQUEMA` en `analisis.ts`, en sincronía con `Analisis` en `types/db.ts`), effort `medium` y `fallbacks: "default"`. Para cambiar de proveedor de transcripción, reemplazar solo `transcripcion.ts`.
- **Asistente de voz / Jarvis**: fuera de `/jarvis`, solo push-to-talk (escucha mientras el micrófono está activo, nunca de fondo). En `/jarvis` hay **modo manos libres opt-in**: escucha continua solo con el modo prendido y la pestaña visible, se pausa mientras piensa o habla, se apaga al salir o cambiar de pestaña, y toma como pregunta lo que sigue a "Jarvis" (`useManosLibres`; en iOS no se ofrece). Al entrar hay que tocar "Activar Jarvis" (los navegadores no dejan hablar sin un toque): saluda con el briefing. Sin Web Speech API: aviso + teclado. Historial solo de la sesión (estado + `sessionStorage`). La Edge Function `asistente` valida `es_miembro()`, manda siempre un **panorama de hoy** (reuniones, acciones de hoy y vencidas, cotizaciones sin respuesta, grabaciones sin procesar, clientes activos) y le da a Claude **herramientas de solo lectura** (`herramientas.ts`: agenda, buscar/leer grabaciones, clientes y prospectos, cotizaciones, finanzas, metas, catálogo, sistemas y demos) con bucle de hasta 6 vueltas (la última con `tool_choice: none`). Nunca escribe en la base. Modelo `claude-sonnet-5-5`, effort `low`, `fallbacks: "default"`, tools `strict`. Respuesta en texto plano para voz (`limpiarParaVoz`). La función devuelve `respuesta` (pantalla) y `respuesta_voz` (lo que se lee): si la respuesta pasa 600 caracteres, una segunda llamada corta a Claude arma un resumen hablado (cuida los créditos de ElevenLabs). **Voz**: `useVoz` usa la función `voz` (ElevenLabs, secrets `ELEVENLABS_API_KEY` y opcional `ELEVENLABS_VOICE_ID`/`ELEVENLABS_MODEL`; por defecto voz "Daniel" y `eleven_multilingual_v2`, timeout 15 s en la función y 12 s en el navegador, tope 700 caracteres; devuelve el MP3 como `application/octet-stream` para que `functions.invoke` lo entregue como Blob) y, si no está configurada o falla, `speechSynthesis` con la voz en español más grave disponible. Sin la clave, todo tiene que seguir funcionando.
- **Gráficos**: un solo eje, series con tokens `serie-ingreso` / `serie-costo` (validados para daltonismo), leyenda, tooltip al pasar y vista de tabla.
- **Demo → etapa demo** (0011, triggers en la base): un prospecto en `contacto` o `reunion` pasa solo a `demo` (al final de la columna) cuando se le vincula una ficha (`ficha_demo_id`) o cuando se crea/edita una ficha de Demos web cuyo `cliente` coincide con un único prospecto (`nombre_comparable()`: sin mayúsculas, tildes, "@" ni espacios, por empresa o nombre). Si el prospecto no tenía demo, la ficha se vincula sola. Nunca retrocede etapas ni pisa un movimiento manual (editar una ficha sin cambiar cliente/sección/estado no lo vuelve a mover). Al cargar una demo nueva, poné en `cliente` el mismo nombre del prospecto.
- **Pipeline**: el orden dentro de cada columna es `prospectos.orden` (número decimal); al soltar una tarjeta entre dos se usa el promedio, así se actualiza una sola fila.
- **Esquema versionado**: cualquier cambio de base va como archivo nuevo en `supabase/migrations/` (`NNNN_descripcion.sql`), idempotente cuando sea posible. Lo aplica el Action al mergear (ver "Migraciones automáticas"). Mantener `src/types/` en sincronía.
- **RLS siempre activo** en todas las tablas y en el bucket. Acceso solo para usuarios autenticados cuyo email esté en la tabla `miembros` (función `es_miembro()`). La tabla `miembros` se edita solo desde el panel de Supabase.
- **Miniaturas de fichas**: captura subida > vista previa en vivo (`PreviewSitio`: iframe a 1280×720 escalado, sin interacción, montado al entrar en pantalla; solo si `modo_apertura = 'iframe'`) > iniciales.
- **Imágenes**: bucket privado `capturas` de Supabase Storage. En la base se guarda solo la ruta (`fichas.imagen_path`); para mostrarlas se generan URLs firmadas temporales. Al reemplazar o borrar una ficha se borra también el archivo.
- **Iframes**: muchas apps bloquean ser embebidas (`X-Frame-Options` / `frame-ancestors`). Cada ficha tiene `modo_apertura` (`iframe` | `pestana`); el visor siempre ofrece "abrir en pestaña nueva" como salida.
- **Estética** (basada en la demo del estudio + logo de brixx): oscura, fondo gris carbón (`fondo` #121316), superficies `superficie`/`elevada` con bordes sutiles, acento azul de marca (`acento` #2D61FE, `acento-claro` #C4CFFE; para texto sobre fondo oscuro usar `acento-texto`). Títulos en **Bricolage Grotesque** (`font-display`, se aplica sola a h1–h3), texto en **Figtree**. Botones de 44px con radio 11px, inputs de 44px con radio 10px, paneles con radio 16px. Filtros como pastillas (`Chip`) y controles segmentados (`Segmentado`) con el activo invertido (fondo claro, texto oscuro). Edición en hoja lateral (`Modal`), no en popup centrado. Cada etapa del pipeline tiene su par de tokens fondo/texto en `features/pipeline/etapas.ts`. Horas en formato 24 h. Los colores son tokens en `@theme` de `src/index.css`; no usar colores sueltos en componentes.
- **Componentes**: funcionales con hooks. Acceso a datos encapsulado en hooks por feature (`useFichas`, `useProspectos`, `useCobros`…, la mayoría sobre `useTabla`), no llamadas a Supabase sueltas en componentes de UI.
- **Responsive**: tiene que poder usarse desde el celular (consultar el pipeline en una reunión).
- **Sin dependencias innecesarias**: antes de sumar una librería, preferir lo que ya está en el stack.
- **Deploy**: `main` se despliega a producción en Vercel y dispara las migraciones. SPA con rewrite de todas las rutas a `index.html` (`vercel.json`).

## Comandos

```
npm install
npm run dev       # desarrollo local
npm run build     # build de producción
npm run typecheck # chequeo de tipos
```
