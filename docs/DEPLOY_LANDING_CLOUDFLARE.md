# Instructivo: dominio y landing en Cloudflare

Qué se publica y dónde:

| Pieza | Dónde | Dirección |
| --- | --- | --- |
| Landing con el botón de descarga y la APK (`landing/`) | Cloudflare Pages (gratis) | `https://tudominio.com` |
| Portal + API + base de datos (`deploy/`, Docker + Caddy) | Tu servidor (Fase 7) | `https://app.tudominio.com` |

La APK abre `app.tudominio.com`. **Esa dirección queda grabada en la APK**, por eso el orden importa.

## Orden recomendado

1. **Cuenta y dominio** (se puede hacer ya).
2. **Publicar la landing** (se puede hacer ya; mostrará «La app estará disponible muy pronto»).
3. **Servidor y `app.tudominio.com`** (Fase 7).
4. **Compilar la APK real** y volver a publicar la landing con la APK.

## 1. Cuenta y dominio

1. Crear la cuenta en <https://dash.cloudflare.com/sign-up> (plan Free). Activar verificación en dos pasos.
2. Dominio, dos caminos:
   - **Comprarlo en Cloudflare:** *Domain Registration → Register Domains*. Los `.com`, `.net`, `.org`, etc. se venden a precio de costo y el DNS queda en Cloudflare automáticamente. Elegí un nombre corto y definitivo: cambiarlo después obliga a recompilar y redistribuir la APK.
   - **Ya tenés uno (o querés un `.com.ar`):** Cloudflare no vende `.com.ar`. Se registra en NIC Argentina y después se delegan los servidores de nombres a Cloudflare: *Websites → Add a domain*, elegir Free, y cargar en NIC los dos nameservers que Cloudflare indica. Tarda unas horas en activarse.
3. Anotá el dominio elegido: lo necesito para compilar la APK.

## 2. Publicar la landing

La carpeta a subir es `landing/` (contiene `index.html`, `landing.css`, `landing.js`, `app.json`, `_headers`, `assets/` y `downloads/`).

### Opción A: arrastrar y soltar (la más simple)

1. *Workers & Pages → Create → Pages → Upload assets*.
2. Nombre del proyecto: `ikigai-landing` (queda en `ikigai-landing.pages.dev`).
3. Arrastrar **el contenido** de `landing/` (no la carpeta contenedora, para que `index.html` quede en la raíz) y *Deploy*.
4. Abrir `https://ikigai-landing.pages.dev` y revisar.

### Opción B: línea de comandos (para repetirlo en cada versión)

```bash
cd /media/marcos/A68072A880727F1D/01-Marcos/00-Programacion/00-Proyectos/apps-moviles/app-ikigai
npx wrangler login                                   # abre el navegador, una sola vez
npx wrangler pages deploy landing --project-name ikigai-landing
```

(`wrangler` se baja solo con `npx`. Sube el contenido de la carpeta tal como está en el disco, incluida la APK aunque esté fuera de Git.)

### Dominio propio

*Workers & Pages → ikigai-landing → Custom domains → Set up a domain* → `tudominio.com` (y, si querés, `www.tudominio.com`). Cloudflare crea los registros DNS y el certificado HTTPS solo.

Límites a tener en cuenta: 25 MiB por archivo (la APK pesa ~3–6 MB) y 20.000 archivos por sitio.

## 3. El servidor (Fase 7)

Cuando haya servidor, en *DNS* del dominio:

| Tipo | Nombre | Contenido | Proxy |
| --- | --- | --- | --- |
| A | `app` | IP pública del servidor | **Solo DNS** (nube gris) |

Con la nube gris, Caddy obtiene su propio certificado de Let's Encrypt sin interferencias. Después se despliega siguiendo `docs/DEPLOYMENT.md` con `SITE_ADDRESS=app.tudominio.com`.

Comprobar: `curl https://app.tudominio.com/healthz` responde `{"status":"ok"}`.

## 4. Compilar la APK real y publicarla

Con `app.tudominio.com` funcionando:

```bash
bash apk/build-apk.sh app.tudominio.com 1.0.0 1
```

Genera `landing/downloads/ikigai-training.apk`, actualiza `landing/app.json` (versión, tamaño y SHA-256) y escribe `deploy/assetlinks.json`. Después:

1. **Reconstruir y reiniciar la imagen web** del servidor para que sirva `https://app.tudominio.com/.well-known/assetlinks.json`. Comprobar con `curl`. **Sin esto la app se abre con barra de direcciones.**
2. Volver a publicar la landing (`npx wrangler pages deploy landing --project-name ikigai-landing`, o arrastrar de nuevo).
3. Descargar la APK desde `https://tudominio.com` en un teléfono real, instalarla y entrar con una cuenta de prueba.
4. **Respaldar `~/.ikigai-signing/`** (la clave de firma) fuera de esta computadora. Sin ella no se puede actualizar la app instalada.

Para sacar una versión nueva de la APK: subir el `versionCode` (2, 3, …) y repetir.

## Qué no hay que hacer

- No subir la APK ni la clave de firma a GitHub (`*.apk`, `*.keystore` ya están en `.gitignore`).
- No poner el servidor detrás de la nube naranja de Cloudflare hasta haber probado todo con la gris.
- No cambiar el dominio de la app después de repartir la APK.
