# Brixx Hub

Panel interno de brixx: sistemas de gestión, demos web y pipeline comercial en un solo lugar.

Stack: React + Vite + TypeScript + Tailwind · Supabase (auth, base, storage) · Vercel.
Detalles del proyecto y convenciones en [`CLAUDE.md`](./CLAUDE.md).

---

## Migraciones automáticas (GitHub Action)

Los cambios de base de datos **ya no se corren a mano**. El workflow [`.github/workflows/migraciones.yml`](./.github/workflows/migraciones.yml) hace esto:

| Cuándo | Qué hace |
|---|---|
| Se abre o actualiza un **Pull request** que toca `supabase/migrations/` | **Simula**: lista qué migraciones se aplicarían, sin tocar la base (check "Simular migraciones") |
| Se **mergea a `main`** | **Aplica** en Supabase las migraciones pendientes (`supabase db push`) |
| A mano: **Actions → Migraciones de Supabase → Run workflow** | Aplica las pendientes (útil para reintentar) |

La 0001 se corrió a mano en el SQL Editor, así que no figura en el historial de la CLI. El script lo detecta (las tablas existen pero no está registrada) y la **marca como aplicada sin volver a correrla**. Después aplica solo lo que falta (hoy, la 0002).

### Configurar el secret (una sola vez, desde la web)

Hace falta **un solo secret**: `SUPABASE_DB_URL`, la dirección de conexión a la base.

**1. Sacar el valor en Supabase**

1. Entrá a tu proyecto en [supabase.com](https://supabase.com/dashboard).
2. Tocá el botón **Connect**, arriba de todo.
3. En **Connection String** elegí el método **Session pooler**. *No* uses "Direct connection": GitHub no la alcanza (es solo IPv6).
4. Copiá la URI. Tiene esta forma:
   `postgresql://postgres.abcdefghijkl:[YOUR-PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`
5. Reemplazá `[YOUR-PASSWORD]` (con los corchetes) por la **contraseña de la base**, la que elegiste al crear el proyecto.
   - ¿No la recordás? **Project Settings → Database → Reset database password**. No afecta al hub, que entra con la clave pública.
   - Usá una contraseña con **solo letras y números**: los símbolos como `@ # / ?` rompen la URI.

**2. Cargarlo en GitHub**

1. Abrí el repo `brixx-hub` → **Settings** → **Secrets and variables** → **Actions**.
2. **New repository secret**.
3. Name: `SUPABASE_DB_URL`. Secret: la URI completa del paso anterior, con la contraseña.
4. **Add secret**.

**3. Probar**

En el Pull request abierto, entrá a **Checks → Migraciones de Supabase → Re-run jobs**. En el resumen tiene que aparecer la lista de migraciones que se aplicarían. Si da error de conexión, revisá la contraseña y que sea la URI del *Session pooler*.

> Las versiones de preview de Vercel usan la **misma base** que producción. Si un PR trae una migración nueva, su preview puede mostrar errores en lo que dependa de las tablas nuevas hasta que se mergee.

---

## Grabaciones de reuniones

Desde el celular se graba una reunión (**Grabaciones → Grabar**, o "Grabar esta reunión" en el Calendario). El audio se guarda en Supabase y la función `grabaciones` hace dos cosas:

1. Lo **transcribe** con AssemblyAI: texto en español, separado por quién habla.
2. Lo **analiza** con Claude: resumen, puntos clave con su cita, decisiones, próximos pasos y una propuesta de trabajo con los servicios y precios del catálogo.

**Se puede grabar antes de configurar nada.** Las grabaciones quedan "Pendientes de transcribir". Cuando estén las claves, se procesan con el botón **Transcribir y analizar** de cada una. Los audios se borran solos a los 90 días; la transcripción y el análisis quedan.

### Configuración (una sola vez, desde la web)

**1. Publicar la función (GitHub)**

1. En Supabase, tocá tu avatar (arriba a la derecha) → **Account preferences → Access Tokens → Generate new token**. Ponele un nombre (`github-actions`) y copiá el token: empieza con `sbp_`.
2. En GitHub, en el repo: **Settings → Secrets and variables → Actions → New repository secret**. Name: `SUPABASE_ACCESS_TOKEN`; Secret: el token.
3. **Actions → Funciones de Supabase → Run workflow**. Esto la publica ahora; después se publica sola con cada cambio. Tiene que terminar en verde.

**2. Transcripción: AssemblyAI**

1. Creá la cuenta en [assemblyai.com](https://www.assemblyai.com). Al crearla dan **USD 50 de crédito gratis**, sin tarjeta, unas 200 horas de audio.
2. En el panel, copiá tu **API key**.
3. En Supabase: **Edge Functions → Secrets → Add new secret**. Name: `ASSEMBLYAI_API_KEY`; Value: la clave.

**3. Análisis: Anthropic (Claude)**

1. Creá la cuenta en [console.anthropic.com](https://console.anthropic.com) y cargá saldo en **Billing**. Cada reunión de una hora cuesta unos centavos de dólar.
2. **API Keys → Create Key** y copiala.
3. En Supabase: **Edge Functions → Secrets → Add new secret**. Name: `ANTHROPIC_API_KEY`; Value: la clave.

Las claves se aplican al instante, sin volver a publicar nada. Viven solo en Supabase: nunca en el código ni en Vercel.

**4. Probar**

En el hub, entrá a **Grabaciones**, abrí una pendiente y tocá **Transcribir y analizar**. La transcripción tarda unos minutos y el análisis, uno o dos más. La página se actualiza sola.

### Clientes e intervenciones

**Clientes** (menú → Clientes) tiene una carpeta por cliente y cliente potencial. Cada carpeta muestra:
- sus datos: contacto, mail, teléfono, Instagram, web, rubro e industria;
- sus **objetivos** y las **soluciones que le proponemos**, con el servicio del catálogo y el precio;
- qué hacer ahora (con botones para pasarlo al pipeline o agendarlo) y qué falta saber;
- todas sus intervenciones, audios y reuniones.

**Nueva intervención**: después de hablar con un cliente, cargá lo que tengas:
- un **audio** (por ejemplo, una nota de voz de WhatsApp: mantené apretado el audio → Compartir → guardalo en Archivos);
- un **texto**: el chat, un mail o tus notas;
- sus **links**: Instagram, web.

Claude lo analiza y te devuelve, bien resumido: **dolores**, **cuellos de botella**, **soluciones y servicios** a ofrecer (con el total y un botón para armar la cotización) y una **propuesta para mandarle** (copiar, WhatsApp o mail).

Si no elegís el cliente, lo detecta solo. Si no tiene carpeta, **se crea sola** (y aparece en el pipeline, en Contacto), con los datos que se mencionaron. Después se actualiza el resumen de su carpeta.

Acepta audios .opus (WhatsApp), .ogg, .m4a, .mp3 y .wav, hasta 50 MB. Claude lee las webs; Instagram casi no se deja leer, pero el link queda guardado en la carpeta. Jarvis también consulta las carpetas y las intervenciones.

> **Al grabar con el celular:** dejá la pantalla prendida y el hub abierto. El celular corta el micrófono si se bloquea o cambiás de app. Lo grabado hasta ese momento se guarda en el teléfono y se puede recuperar.

---

## Jarvis y el asistente de voz

**Jarvis** (menú → Jarvis) es el centro de comando por voz. Muestra:
- un núcleo animado;
- el estado del sistema;
- un resumen del estudio;
- el feed del día;
- la agenda de hoy;
- comandos rápidos.

**Cómo se usa:**
1. Tocá **Activar Jarvis**. Te saluda con el briefing del día.
2. Queda en **manos libres**: decí "Jarvis" seguido de tu pregunta. Por ejemplo: "Jarvis, ¿qué hay para hoy?", "Jarvis, ¿qué se sabe de la reunión con Nova?" o "Jarvis, ¿cuánto cobramos este mes?".

**Cuándo escucha:**
- Solo con el modo manos libres prendido (botón de la oreja) y con la pestaña a la vista.
- Mientras piensa o habla, deja de escuchar.
- Se apaga al salir de la pantalla.

**En iPhone** el navegador no permite escuchar todo el tiempo: tocá el núcleo o el micrófono para hablar.

**En el resto del hub** está el botón azul flotante. Lo tocás, hablás y tocás el cuadrado rojo para mandar. Ahí nunca escucha de fondo.

**Qué puede responder:**
- Siempre sabe lo de hoy.
- Para lo demás consulta el hub: agenda, grabaciones (resumen, puntos clave, próximos pasos y, si hace falta, lo que se dijo textual), clientes y prospectos, cotizaciones, cobros y costos, metas, catálogo y sistemas.
- **Solo consulta**: no agenda ni modifica nada.

**Configuración:** usa la misma clave `ANTHROPIC_API_KEY` de Supabase que las grabaciones. Se publica sola al mergear, con el token `SUPABASE_ACCESS_TOKEN`. Cada pregunta cuesta uno o dos centavos de dólar.

### Voz premium (ElevenLabs, opcional)

Sin configurar nada, Jarvis lee con la voz del dispositivo (la más grave en español que encuentre). Con ElevenLabs habla con una voz natural, grave y sobria. Si ElevenLabs falla o se terminan los créditos, vuelve solo a la voz del dispositivo.

1. Creá la cuenta en [elevenlabs.io](https://elevenlabs.io). El plan **Free** da unos 10.000 créditos por mes; el **Starter** (unos USD 5) da 30.000.
2. Tocá tu perfil (abajo a la izquierda) → **API Keys** → **Create API Key**. Si te pide permisos, alcanza con **Text to Speech**. Copiala.
3. En Supabase: **Edge Functions → Secrets → Add new secret**. Name: `ELEVENLABS_API_KEY`; Value: la clave.
4. Listo: en Jarvis, la fila **Voz** del estado pasa a decir **Premium**.

**Cambiar la voz (opcional).** Por defecto usa "Daniel", grave y de locutor. Para elegir otra:
1. En ElevenLabs entrá a **Voices → Voice Library**. Filtrá por idioma **Spanish** y género **Male**, y probá las que te gusten.
2. Agregala a **My Voices**, abrila y copiá su **Voice ID**.
3. En Supabase, sumá el secret `ELEVENLABS_VOICE_ID` con ese valor. Se aplica en la siguiente respuesta.

**Consumo.** Usa el modelo `eleven_multilingual_v2`, el más natural en español: 1 crédito por letra. Para cuidar los créditos:
- En pantalla siempre aparece la respuesta completa. A ElevenLabs solo va la parte hablada.
- Si la respuesta pasa los 600 caracteres, Claude arma un resumen hablado de dos o tres oraciones.
- Una respuesta típica cuesta entre 150 y 400 créditos: con el plan Free alcanza para unas 30 a 60 respuestas por mes.
- Para gastar la mitad, sumá el secret `ELEVENLABS_MODEL` = `eleven_flash_v2_5`. Suena un poco menos natural, pero responde más rápido.

**¿Está usando ElevenLabs?** Mirá la fila **Voz** del estado de Jarvis:
- **Premium**: la última respuesta sonó con ElevenLabs.
- **Del dispositivo**: no hay clave, o ElevenLabs falló (sin créditos, error o tardó más de 12 segundos) y la leyó la voz del celular o la compu.

El motivo del error queda en Supabase → **Edge Functions → voz → Logs**.

La clave vive solo en Supabase. Cada respuesta se genera una vez: "Escuchar de nuevo" no gasta créditos.

---

## Puesta en marcha (todo desde la web, sin terminal)

### 1. Supabase: crear el proyecto

1. Entrá a [supabase.com](https://supabase.com) → **New project**.
2. Nombre: `brixx-hub`. Elegí una contraseña de base (guardala) y la región más cercana (São Paulo).
3. Esperá a que termine de crearse (1–2 minutos).

### 2. Supabase: crear las tablas

> Si ya configuraste las [migraciones automáticas](#migraciones-automáticas-github-action), alcanza con correr a mano **solo la 0001** (tiene los emails de los socios). El Action registra la 0001 y aplica las demás.

Hay que correr **los archivos de `supabase/migrations/` en orden** (0001, después 0002…). Para cada uno:

1. Abrí el archivo acá en GitHub (por ejemplo [`supabase/migrations/0001_esquema_inicial.sql`](./supabase/migrations/0001_esquema_inicial.sql)) y copiá todo el contenido.
2. En Supabase: menú izquierdo → **SQL Editor** → **New query** → pegalo.
3. **Solo en la 0001, antes de ejecutar**: bajá hasta el final (sección 7) y reemplazá los dos emails y nombres por los tuyos y los de tu socio.
4. Tocá **Run**. Tiene que decir *Success. No rows returned*.
5. Verificá en **Table Editor** que estén las tablas (`miembros`, `fichas`, `prospectos`, `servicios`, `cotizaciones`, `cobros`, `costos`, `reuniones`…) y en **Storage** el bucket `capturas`.

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
