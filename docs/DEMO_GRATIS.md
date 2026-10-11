# Demo 100 % gratuita (sin dominio pago)

Objetivo: mostrarle la app a Agustin con **datos ficticios**, sin gastar nada. Cuando él confirme y haya presupuesto, se pasa a la versión definitiva con dominio propio (al final).

## Qué se usa y qué cuesta

| Pieza | Servicio gratuito | Dirección |
| --- | --- | --- |
| Landing y descarga de la APK | **Cloudflare Pages** | `https://ikigai-landing.pages.dev` |
| Sistema (portal + API + base) | **Tu computadora** + túnel gratuito de **Cloudflare** (*quick tunnel*, no pide cuenta ni dominio) | `https://<palabras-al-azar>.trycloudflare.com` |
| APK | Se compila apuntando a la dirección del túnel | se baja desde la landing |

**No necesitás dominio pago** para nada de esto: `pages.dev` y `trycloudflare.com` ya traen HTTPS.

## Lo que tenés que saber antes (límites reales)

1. **La dirección del túnel cambia cada vez que se vuelve a levantar** (por ejemplo al reiniciar la computadora). La APK lleva esa dirección grabada, así que cada vez que cambie hay que recompilarla y volver a subir la landing. El script lo hace en un solo comando, pero una APK vieja instalada en un teléfono **deja de funcionar**: hay que bajar la nueva desde la landing e instalarla encima (no hace falta desinstalar).
2. **La computadora tiene que estar encendida y con internet** mientras se usa la demo.
3. El túnel gratuito de Cloudflare es *«para pruebas»*: sin garantía de disponibilidad. Para una demo de un rato alcanza.
4. **Solo datos ficticios.** La hoja de ruta prohíbe cargar datos reales antes de la auditoría externa y la revisión jurídica.
5. «¿Olvidaste tu contraseña?» **no manda correos** en la demo (no hay servicio de correo). Para recuperar una clave se usa «Restablecer clave» desde *Accesos* (administración).
6. Todos los que usen la demo comparten un mismo «lugar» de red para el límite de intentos de acceso (20 por minuto): no es problema para 3–5 personas.

## Paso a paso

### Paso 1 · Instalar `cloudflared` (una sola vez, 1 minuto)

```bash
mkdir -p ~/.local/bin
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o ~/.local/bin/cloudflared
chmod +x ~/.local/bin/cloudflared
~/.local/bin/cloudflared --version
```

### Paso 2 · Levantar la demo

```bash
cd /media/marcos/A68072A880727F1D/01-Marcos/00-Programacion/00-Proyectos/apps-moviles/app-ikigai
bash deploy/demo-gratis.sh
```

Tarda unos minutos la primera vez (construye las imágenes de Docker y compila la APK). El script, en orden:

1. genera los secretos (se guardan en `deploy/.env.demo`, que Git ignora);
2. enciende el túnel y toma su dirección;
3. levanta la base, la API y el portal con HTTPS de Cloudflare;
4. crea el administrador `admin@ikigai.demo` y guarda su clave temporal en `~/.ikigai-demo/administrador.txt`;
5. comprueba que `https://…trycloudflare.com/healthz` y `/.well-known/assetlinks.json` respondan;
6. compila la APK apuntada a esa dirección y deja `landing/app.json` y `landing/downloads/ikigai-training.apk` listos.

Al final imprime la dirección de la demo. Probala vos primero en el navegador.

### Paso 3 · Cargar los datos ficticios

Entrá con el administrador (te pide elegir una clave propia) y seguí la guía de primer uso: servicios → profesores → miembros → horarios → generar clases → crear accesos desde *Accesos*. Usá nombres inventados.

### Paso 4 · Cuenta de Cloudflare y proyecto de Pages (una sola vez)

1. Crear la cuenta gratuita en <https://dash.cloudflare.com/sign-up> (con verificación en dos pasos).
2. No hace falta agregar ningún dominio.

### Paso 5 · Subir la landing (cada vez que se regenera la APK)

**Opción A, arrastrar y soltar:** *Workers & Pages → Create → Pages → Upload assets* → nombre `ikigai-landing` → arrastrar **el contenido** de la carpeta `landing/` (que `index.html` quede en la raíz) → *Deploy*.

**Opción B, comando (recomendada para repetir):**

```bash
npx wrangler login                                   # una sola vez, abre el navegador
npx wrangler pages deploy landing --project-name ikigai-landing
```

(La primera vez `wrangler` pregunta si crea el proyecto: decir que sí.) La landing queda en `https://ikigai-landing.pages.dev`. La APK viaja con ella aunque Git la ignore.

### Paso 6 · Probar como lo va a ver Agustin

1. En un Android, abrir `https://ikigai-landing.pages.dev` y tocar **Descargar APK**.
2. Si Chrome avisa «este tipo de archivo puede dañar tu dispositivo»: *Descargar de todos modos*. Abrir el archivo y permitir *«instalar desde esta fuente»* cuando Android lo pida.
3. Abrir *Ikigai*: debe verse a pantalla completa, **sin barra de direcciones** (eso confirma que `assetlinks.json` funciona). Si aparece la barra, ver «Si algo falla».
4. Entrar con un acceso de prueba.

**Plan B para el teléfono de Agustin (sin APK):** abrir la dirección del túnel en Chrome → menú ⋮ → *Instalar app* / *Agregar a pantalla de inicio*. Funciona igual y no tiene el problema de «orígenes desconocidos».

### Apagar y volver a encender

```bash
bash deploy/demo-gratis.sh estado     # dirección actual
bash deploy/demo-gratis.sh parar      # apaga túnel y contenedores (la base se conserva)
bash deploy/demo-gratis.sh            # vuelve a encender: dirección NUEVA, APK nueva
npx wrangler pages deploy landing --project-name ikigai-landing   # y volver a subir la landing
```

## Si algo falla

| Síntoma | Qué mirar |
| --- | --- |
| El script dice que falta `cloudflared` | Paso 1 |
| «El túnel no entregó dirección» | `~/.ikigai-demo/tunel.log`; probar de nuevo en un minuto |
| La API no arranca | `docker compose -f deploy/compose.yaml --env-file deploy/.env.demo logs api` |
| La app se abre con barra de direcciones | `curl https://<túnel>/.well-known/assetlinks.json` debe mostrar la huella; si no, volver a correr el script; si sí, desinstalar la app y reinstalar |
| La app instalada dice que no encuentra el sitio | La dirección del túnel cambió: bajar la APK nueva desde la landing e instalarla encima |
| 429 al iniciar sesión | Muchos intentos seguidos desde el mismo lugar: esperar un minuto |

## Del demo a la versión definitiva (cuando haya presupuesto)

1. **Dominio propio** (por ejemplo `.com` a precio de costo en Cloudflare Registrar) y un **servidor fijo** (VPS con Docker, ver `docs/DEPLOYMENT.md`).
2. Registro DNS `app.tudominio.com` → IP del servidor; `SITE_ADDRESS=app.tudominio.com` con HTTPS automático.
3. `bash apk/build-apk.sh app.tudominio.com 1.0.0 1`: se compila con **la misma clave de firma** que la demo, así que quien tenga la app de la demo la **actualiza instalando encima** la nueva (sin desinstalar), y pasa a apuntar al dominio definitivo. El `versionCode` tiene que ser mayor que el de la demo (la demo usa fecha y hora, por ejemplo 26101122; usá un número mayor o la fecha del día).
4. Landing en el dominio propio (*Custom domains* en Pages). Ver `docs/DEPLOY_LANDING_CLOUDFLARE.md`.
5. Antes de datos reales: auditoría externa, revisión jurídica (Fase 8) y copias de seguridad fuera del servidor.

**Respaldá `~/.ikigai-signing/`** (la clave de firma) en un lugar seguro fuera de esta computadora: es la misma para la demo y para la versión definitiva.
