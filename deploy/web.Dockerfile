# syntax=docker/dockerfile:1
# Portal estatico + proxy inverso (Caddy). Contexto de build: la raiz del repositorio.
# Se copia SOLO la lista blanca de archivos publicos: nada de server/, docs/, scripts/, old/, landing/ ni la demo
# (demo.html y app.js arman HTML con datos locales y compartirian origen con la sesion: no se publican).
FROM caddy:2-alpine
COPY index.html portal.html reset-password.html accept-invitation.html /srv/
COPY portal.css api-client.js tour.js portal.js reset-password.js accept-invitation.js sw.js sw-register.js manifest.webmanifest /srv/
COPY assets /srv/assets
COPY deploy/Caddyfile /etc/caddy/Caddyfile
# Verificacion de la app Android (TWA): sin este archivo la APK se abre con barra de direccion.
# Lo regenera apk/build-apk.sh con la huella de la clave de firma.
COPY deploy/assetlinks.json /srv/.well-known/assetlinks.json
