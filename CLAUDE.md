# Brixx Hub

Panel interno de **brixx**, agencia de IA de dos socios. Centraliza en un solo lugar:

1. **Sistemas de gestión**: los paneles/apps ya entregados o en desarrollo (ERP ferretería, ERP huevos, POS Doña Martu, etc.). Cada uno es una app independiente con su propia URL; el hub solo los lista y los abre.
2. **Demos web**: menús digitales, cotizadores, landings. Misma lógica de fichas que los sistemas.
3. **Pipeline**: tablero kanban de prospectos comerciales.

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

No hay backend propio: el frontend habla directo con Supabase usando la clave pública (anon/publishable). **La seguridad la dan las políticas RLS**, no el frontend.

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
  lib/format.ts          # etiquetas, montos, fechas
  auth/                  # AuthProvider (sesión + miembro), RequireAuth
  components/ui/         # Button, Field/Input/Select, Modal, Badge... (reutilizables)
  components/layout/     # AppLayout (sidebar + nav móvil), PageHeader, Logo
  features/
    fichas/              # useFichas, FichaCard, FichaForm, ImagenPicker (sistemas + demos)
    pipeline/            # useProspectos, Tablero (kanban), ProspectoCard, ProspectoForm
  pages/                 # una página por ruta
  types/db.ts            # tipos de las tablas de la base
supabase/
  migrations/            # SQL versionado: esquema, RLS, seeds
```

## Rutas

- `/login` — única ruta pública (incluye "olvidé mi contraseña").
- `/nueva-clave` — cambiar contraseña (también destino del link de recuperación).
- `/sistemas`, `/demos` — grilla de fichas filtrada por `seccion`.
- `/ver/:id` — ficha abierta embebida en iframe (con botón "abrir en pestaña nueva").
- `/pipeline` — kanban de prospectos.

## Convenciones

- **Idioma**: UI, nombres de tablas/columnas y textos en **español**. Código (variables, funciones, componentes) en inglés o español, pero consistente dentro de cada archivo; nombres de tablas/columnas siempre como están en la base.
- **Datos, no código**: todo contenido (fichas, prospectos) vive en Supabase y se edita desde formularios del hub. Nunca hardcodear fichas en el código.
- **Pipeline**: el orden dentro de cada columna es `prospectos.orden` (número decimal); al soltar una tarjeta entre dos se usa el promedio, así se actualiza una sola fila.
- **Esquema versionado**: cualquier cambio de base va como archivo nuevo en `supabase/migrations/` (`NNNN_descripcion.sql`), idempotente cuando sea posible. Mantener `src/types/` en sincronía.
- **RLS siempre activo** en todas las tablas y en el bucket. Acceso solo para usuarios autenticados cuyo email esté en la tabla `miembros` (función `es_miembro()`). La tabla `miembros` se edita solo desde el panel de Supabase.
- **Imágenes**: bucket privado `capturas` de Supabase Storage. En la base se guarda solo la ruta (`fichas.imagen_path`); para mostrarlas se generan URLs firmadas temporales. Al reemplazar o borrar una ficha se borra también el archivo.
- **Iframes**: muchas apps bloquean ser embebidas (`X-Frame-Options` / `frame-ancestors`). Cada ficha tiene `modo_apertura` (`iframe` | `pestana`); el visor siempre ofrece "abrir en pestaña nueva" como salida.
- **Estética** (basada en la demo del estudio + logo de brixx): oscura, fondo gris carbón (`fondo` #121316), superficies `superficie`/`elevada` con bordes sutiles, acento azul de marca (`acento` #2D61FE, `acento-claro` #C4CFFE; para texto sobre fondo oscuro usar `acento-texto`). Títulos en **Bricolage Grotesque** (`font-display`, se aplica sola a h1–h3), texto en **Figtree**. Botones de 44px con radio 11px, inputs de 44px con radio 10px, paneles con radio 16px. Filtros como pastillas (`Chip`) y controles segmentados (`Segmentado`) con el activo invertido (fondo claro, texto oscuro). Edición en hoja lateral (`Modal`), no en popup centrado. Cada etapa del pipeline tiene su par de tokens fondo/texto en `features/pipeline/etapas.ts`. Los colores son tokens en `@theme` de `src/index.css`; no usar colores sueltos en componentes.
- **Componentes**: funcionales con hooks. Acceso a datos encapsulado en hooks por feature (`useFichas`, `useProspectos`), no llamadas a Supabase sueltas en componentes de UI.
- **Responsive**: tiene que poder usarse desde el celular (consultar el pipeline en una reunión).
- **Sin dependencias innecesarias**: antes de sumar una librería, preferir lo que ya está en el stack.
- **Deploy**: `main` se despliega a producción en Vercel. SPA con rewrite de todas las rutas a `index.html` (`vercel.json`).

## Comandos

```
npm install
npm run dev       # desarrollo local
npm run build     # build de producción
npm run typecheck # chequeo de tipos
```
