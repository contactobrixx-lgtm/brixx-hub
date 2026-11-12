# Brixx Hub

Panel interno de **brixx**, agencia de IA de dos socios. Centraliza en un solo lugar:

1. **Inicio**: dashboard del estudio en USD (cobrado, costos, margen, ingreso recurrente, por cobrar, ROAS, pendientes, próximas reuniones).
2. **Calendario**: reuniones agendadas + próximas acciones del pipeline.
3. **Pipeline**: kanban de prospectos y clientes (de contacto a mantenimiento).
4. **Cotizador**: catálogo de servicios con precio de implementación y abono mensual, y cotizaciones por cliente con versión imprimible/PDF.
5. **Finanzas**: cobros, costos del estudio y tipo de cambio.
6. **Grabaciones**: reuniones grabadas con el celular → transcripción (AssemblyAI) + análisis con Claude (puntos clave, próximos pasos, propuesta con el catálogo).
7. **Sistemas de gestión** y **Demos web**: fichas de las apps entregadas y de las demos (cada una con su URL; el hub las lista y las abre).

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

El frontend habla directo con Supabase usando la clave pública (anon/publishable). **La seguridad la dan las políticas RLS**, no el frontend. La única parte de servidor es la **Edge Function `grabaciones`** (Deno, en `supabase/functions/`), que guarda las claves de terceros (AssemblyAI, Anthropic) como *secrets* de Supabase: **nunca van al frontend, al repo ni a Vercel**.

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
    inicio/              # useDashboard (todos los cálculos del dashboard), GraficoMensual
    calendario/          # useReuniones, MesGrid, Agenda, ReunionForm, eventos (reuniones + acciones)
    cotizador/           # useServicios, useCotizaciones, CotizacionForm, ServicioForm
    finanzas/            # useCobros, useCostos, useAjustes, calculos.ts, CobroForm, CostoForm, TipoCambio
    fichas/              # useFichas, FichaCard, FichaForm, ImagenPicker (sistemas + demos)
    pipeline/            # useProspectos, Tablero (kanban), ProspectoCard, ProspectoForm, etapas.ts
    grabaciones/         # useGrabadora (MediaRecorder + copia en IndexedDB), useGrabaciones, VistaAnalisis, VistaTranscripcion
  pages/                 # una página por ruta
  types/db.ts            # tipos de las tablas de la base
supabase/
  migrations/            # SQL versionado: esquema, RLS, seeds
  functions/grabaciones/ # Edge Function: index.ts (rutas), transcripcion.ts (AssemblyAI), analisis.ts (Claude)
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
- `/ver/:id` — ficha abierta embebida en iframe (con botón "abrir en pestaña nueva").
- `/pipeline` — kanban de prospectos.

## Convenciones

- **Idioma**: UI, nombres de tablas/columnas y textos en **español**. Código (variables, funciones, componentes) en inglés o español, pero consistente dentro de cada archivo; nombres de tablas/columnas siempre como están en la base.
- **Datos, no código**: todo contenido (fichas, prospectos, servicios, cotizaciones, cobros, costos, reuniones, grabaciones) vive en Supabase y se edita desde formularios del hub. Nunca hardcodear fichas en el código.
- **Etapas**: `contacto → reunion → demo → propuesta` (abiertas) → `cerrado → implementacion → mantenimiento` (ganadas) / `perdido`. Un **cliente** es un prospecto en etapa ganada; no hay tabla aparte. Constantes `ETAPAS_ABIERTAS`, `ETAPAS_GANADAS`, `ETAPAS_ACTIVAS` en `types/db.ts`.
- **Dinero**: cada monto se guarda con su `moneda` (ARS | USD). El dashboard muestra **todo en USD**, convirtiendo ARS con `ajustes.tipo_cambio_usd` (ARS por 1 USD) vía `aUSD()`. Si falta el tipo de cambio, lo ARS no se suma y aparece un pendiente.
- **Cotizaciones**: los precios del catálogo (`servicios`) están en USD. Cada ítem copia el precio al agregarse (snapshot): cambiar el catálogo no altera cotizaciones viejas. El descuento aplica solo a la implementación. Al guardar una cotización como `aceptada`, el prospecto pasa a `cerrado` (si estaba abierto) y su `valor_estimado` toma el total.
- **Por cobrar** = implementación de cotizaciones aceptadas − cobros no-abono del cliente. **Ingreso recurrente** = abonos de cotizaciones aceptadas de clientes activos.
- **Costos**: `mensual` cuenta cada mes entre `desde` y `hasta`; `anual` cuenta 1/12 por mes; `unico` solo en el mes de `desde`. Categoría `adquisicion` alimenta el ROAS.
- **Grabaciones**: estados `pendiente → transcribiendo → analizando → lista` (o `error` con motivo). Sin claves cargadas, todo queda `pendiente` y se procesa después con el botón de la grabación: la app tiene que funcionar sin las claves. El aviso del proveedor llega por webhook; si no llega, el hub consulta (`actualizar`) mientras la página está abierta. Audio en bucket privado `grabaciones`, se borra a los 90 días (el hub lo limpia al listar). El análisis usa `claude-opus-5-5` con `output_config.format` (JSON schema `ESQUEMA` en `analisis.ts`, en sincronía con `Analisis` en `types/db.ts`), effort `medium` y `fallbacks: "default"`. Para cambiar de proveedor de transcripción, reemplazar solo `transcripcion.ts`.
- **Gráficos**: un solo eje, series con tokens `serie-ingreso` / `serie-costo` (validados para daltonismo), leyenda, tooltip al pasar y vista de tabla.
- **Pipeline**: el orden dentro de cada columna es `prospectos.orden` (número decimal); al soltar una tarjeta entre dos se usa el promedio, así se actualiza una sola fila.
- **Esquema versionado**: cualquier cambio de base va como archivo nuevo en `supabase/migrations/` (`NNNN_descripcion.sql`), idempotente cuando sea posible. Lo aplica el Action al mergear (ver "Migraciones automáticas"). Mantener `src/types/` en sincronía.
- **RLS siempre activo** en todas las tablas y en el bucket. Acceso solo para usuarios autenticados cuyo email esté en la tabla `miembros` (función `es_miembro()`). La tabla `miembros` se edita solo desde el panel de Supabase.
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
