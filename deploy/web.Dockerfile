# syntax=docker/dockerfile:1
# Portal estatico + proxy inverso (Caddy). Contexto de build: la raiz del repositorio.
# Se copia SOLO la lista blanca de archivos publicos: nada de server/, docs/, scripts/ ni old/.
FROM caddy:2-alpine
COPY index.html portal.html demo.html reset-password.html accept-invitation.html /srv/
COPY portal.css styles.css api-client.js portal.js app.js reset-password.js accept-invitation.js sw.js sw-register.js manifest.webmanifest /srv/
COPY assets /srv/assets
COPY deploy/Caddyfile /etc/caddy/Caddyfile
