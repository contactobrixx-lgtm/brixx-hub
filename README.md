# Brixx Hub

Panel interno de brixx: sistemas de gestión, demos web y pipeline comercial en un solo lugar.

Stack: React + Vite + TypeScript + Tailwind · Supabase (auth, base, storage) · Vercel.
Detalles del proyecto y convenciones en [`CLAUDE.md`](./CLAUDE.md).

---

## Puesta en marcha (todo desde la web, sin terminal)

### 1. Supabase: crear el proyecto

1. Entrá a [supabase.com](https://supabase.com) → **New project**.
2. Nombre: `brixx-hub`. Elegí una contraseña de base (guardala) y la región más cercana (São Paulo).
3. Esperá a que termine de crearse (1–2 minutos).

### 2. Supabase: crear las tablas

1. Abrí el archivo [`supabase/migrations/0001_esquema_inicial.sql`](./supabase/migrations/0001_esquema_inicial.sql) acá en GitHub y copiá todo el contenido.
2. En Supabase: menú izquierdo → **SQL Editor** → **New query** → pegalo.
3. **Antes de ejecutar**, bajá hasta el final (sección 7) y reemplazá los dos emails y nombres por los tuyos y los de tu socio.
4. Tocá **Run**. Tiene que decir *Success. No rows returned*.
5. Verificá en **Table Editor** que estén las tablas `miembros`, `fichas` y `prospectos`, y en **Storage** el bucket `capturas`.

> Para sumar a alguien más en el futuro: **Table Editor → miembros → Insert row** con su email, y después creale el usuario (paso 4).

### 3. Supabase: cerrar el registro público

1. **Authentication → Sign In / Providers** (o *Providers*, según la versión del panel).
2. Desactivá **Allow new users to sign up** y guardá.
3. Confirmá que el proveedor **Email** esté habilitado.

### 4. Supabase: crear los dos usuarios

1. **Authentication → Users → Add user → Create new user**.
2. Email (el mismo que pusiste en `miembros`) + contraseña.
3. Tildá **Auto Confirm User** y creá.
4. Repetí para tu socio. Después cada uno puede cambiar su contraseña desde el hub (botón *Contraseña*).

### 5. Supabase: copiar las claves

1. **Project Settings → API** (o *Data API* / *API Keys*).
2. Copiá:
   - **Project URL** → `https://xxxx.supabase.co`
   - **anon public** key (o **publishable key**, empieza con `sb_publishable_`).
3. **No** uses la `service_role` / secret key en ningún lado.

### 6. GitHub: pasar el código a `main`

El código está en la rama `claude/elegant-keller-4at0n8`. En GitHub: **Pull requests → New pull request** → base `main`, compare `claude/elegant-keller-4at0n8` → **Create** → **Merge**.
(Si el repo todavía no tiene `main`, en **Settings → General → Default branch** podés usar directamente esta rama.)

### 7. Vercel: desplegar

1. Entrá a [vercel.com](https://vercel.com) con tu cuenta de GitHub → **Add New… → Project**.
2. Importá el repo `brixx-hub`. Vercel detecta **Vite** solo; no cambies los comandos de build.
3. Abrí **Environment Variables** y agregá:
   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | la Project URL del paso 5 |
   | `VITE_SUPABASE_ANON_KEY` | la anon / publishable key del paso 5 |
4. **Deploy**. Al terminar copiá el dominio (ej. `brixx-hub.vercel.app`).

> Si cambiás una variable de entorno después, hay que ir a **Deployments → ⋯ → Redeploy** para que tome el valor nuevo.

### 8. Supabase: avisarle dónde vive el hub

Necesario para que funcione el link de "¿Olvidaste tu contraseña?".

1. **Authentication → URL Configuration**.
2. **Site URL**: `https://brixx-hub.vercel.app` (tu dominio).
3. **Redirect URLs** → agregá `https://brixx-hub.vercel.app/**`.
4. Guardá.

### 9. Probar

Entrá a tu dominio, logueate, y cargá tu primera ficha con **Nuevo sistema** (podés pegar una captura con Ctrl+V).

---

## Notas

- **"No carga dentro del hub"**: algunas apps no se dejan embeber (cabeceras `X-Frame-Options` o `frame-ancestors`). Editá la ficha y elegí **Pestaña nueva**. Si la app es tuya y está en Vercel, podés permitir el embebido quitando esas cabeceras en ese proyecto.
- **Mails de recuperación**: Supabase usa un servidor de correo propio con límite bajo de envíos por hora. Para dos usuarios alcanza.
- **Desarrollo local** (opcional): copiar `.env.example` a `.env.local`, completar, y `npm install && npm run dev`.
