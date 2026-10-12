#!/usr/bin/env bash
# Demo 100 % gratuita: el sistema corre en esta computadora y sale a internet con HTTPS por un «quick tunnel» de
# Cloudflare (sin cuenta ni dominio). Pensada para mostrar la app con DATOS FICTICIOS; no es produccion.
#
#   bash deploy/demo-gratis.sh            # levanta todo y publica la direccion en landing/app.json y la APK
#   bash deploy/demo-gratis.sh parar      # apaga el tunel y los contenedores (los datos se conservan)
#   bash deploy/demo-gratis.sh estado     # direccion actual y estado
#
# Variables opcionales: SIN_APK=1 (no compila la APK), DEMO_URL_FALSA=https://x.example (prueba local sin tunel).
#
# Lo que hay que saber:
#  - La direccion https://<al-azar>.trycloudflare.com CAMBIA cada vez que se levanta el tunel. La APK lleva grabada la
#    direccion, asi que cada vez que cambie hay que recompilarla y volver a subir landing/ (este script lo hace).
#  - Con la computadora apagada o sin internet, la app no funciona.
#  - La clave de firma de la APK (~/.ikigai-signing) es la definitiva: respaldarla.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
DEMO="$HOME/.ikigai-demo"
ENVF="$REPO/deploy/.env.demo"
LOG="$DEMO/tunel.log"
PIDF="$DEMO/tunel.pid"
PUERTO="${HTTP_PORT:-8080}"
COMPOSE=(docker compose -f "$REPO/deploy/compose.yaml" --env-file "$ENVF")
CLOUDFLARED="$(command -v cloudflared || true)"
[ -n "$CLOUDFLARED" ] || { [ -x "$HOME/.local/bin/cloudflared" ] && CLOUDFLARED="$HOME/.local/bin/cloudflared"; } || true

umask 077
mkdir -p "$DEMO"

url_actual() { grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG" 2>/dev/null | tail -1 || true; }
tunel_vivo() { [ -f "$PIDF" ] && kill -0 "$(cat "$PIDF")" 2>/dev/null; }

case "${1:-}" in
  parar)
    tunel_vivo && kill "$(cat "$PIDF")" && echo "Tunel apagado."
    rm -f "$PIDF"
    [ -f "$ENVF" ] && "${COMPOSE[@]}" down && echo "Contenedores apagados (los datos quedan en el volumen)."
    exit 0 ;;
  estado)
    if tunel_vivo; then echo "Tunel: encendido -> $(url_actual)"; else echo "Tunel: apagado"; fi
    [ -f "$ENVF" ] && "${COMPOSE[@]}" ps || true
    exit 0 ;;
esac

command -v docker >/dev/null || { echo "Falta Docker." >&2; exit 1; }
if [ -z "${DEMO_URL_FALSA:-}" ] && [ -z "$CLOUDFLARED" ]; then
  cat >&2 <<'EOF'
Falta cloudflared (el cliente gratuito del tunel). Instalalo una sola vez:
  mkdir -p ~/.local/bin
  curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o ~/.local/bin/cloudflared
  chmod +x ~/.local/bin/cloudflared
y volve a correr este script.
EOF
  exit 1
fi

# ---- 1. secretos (se generan una vez y se conservan: la base de la demo persiste entre ejecuciones)
if [ ! -f "$ENVF" ]; then
  {
    echo "NODE_ENV=production"
    echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
    echo "SESSION_SECRET=$(openssl rand -hex 32)"
    echo "PASSWORD_RESET_DELIVERY_TOKEN=$(openssl rand -hex 32)"
    echo "GYM_TIMEZONE=America/Argentina/Buenos_Aires"
    # Caddy detras del tunel habla HTTP y acepta cualquier nombre de host.
    echo "SITE_ADDRESS=http://:80"
    echo "BIND_ADDRESS=127.0.0.1"          # solo esta maquina: lo unico que entra desde afuera es el tunel
    echo "HTTP_PORT=$PUERTO"
    echo "HTTPS_PORT=8443"
  } > "$ENVF"
  chmod 600 "$ENVF"
fi

grep -q '^BIND_ADDRESS=' "$ENVF" || echo "BIND_ADDRESS=127.0.0.1" >> "$ENVF"

# ---- 2. assetlinks (huella de la clave) antes de construir la imagen web
SOLO_ASSETLINKS=1 bash "$REPO/apk/build-apk.sh" demo >/dev/null

# ---- 3. tunel (o direccion falsa para probar sin salir a internet)
if [ -n "${DEMO_URL_FALSA:-}" ]; then
  URL="$DEMO_URL_FALSA"
else
  if ! tunel_vivo; then
    : > "$LOG"
    nohup "$CLOUDFLARED" tunnel --no-autoupdate --url "http://localhost:$PUERTO" > "$LOG" 2>&1 &
    echo $! > "$PIDF"
  fi
  echo -n "Esperando la direccion del tunel"
  for _ in $(seq 1 60); do URL="$(url_actual)"; [ -n "$URL" ] && break; echo -n "."; sleep 1; done
  echo
  [ -n "${URL:-}" ] || { echo "El tunel no entrego direccion. Ver $LOG" >&2; exit 1; }
fi
HOST="${URL#https://}"
echo "Direccion de la demo: $URL"

# ---- 4. configuracion que depende de la direccion, y contenedores
python3 - "$ENVF" "$URL" <<'PY'
import sys
path, url = sys.argv[1:3]
lines = [l for l in open(path, encoding="utf-8").read().splitlines()
         if not l.startswith(("PUBLIC_ORIGIN=", "PASSWORD_RESET_DELIVERY_URL=", "PASSWORD_RESET_PUBLIC_URL="))]
lines += [f"PUBLIC_ORIGIN={url}",
          # La demo no envia correos: valores de relleno que cumplen la validacion de produccion. «Olvide mi clave»
          # no entrega nada; se usa «Restablecer clave» desde administracion.
          "PASSWORD_RESET_DELIVERY_URL=https://recuperacion-no-configurada.invalid/ikigai",
          f"PASSWORD_RESET_PUBLIC_URL={url}/reset-password.html"]
open(path, "w", encoding="utf-8").write("\n".join(lines) + "\n")
PY
"${COMPOSE[@]}" up -d --build
echo -n "Esperando al servidor"
for _ in $(seq 1 90); do
  curl -fsS -H "Host: $HOST" "http://localhost:$PUERTO/healthz" >/dev/null 2>&1 && break; echo -n "."; sleep 2
done
echo

# ---- 5. primer administrador (solo si la base esta vacia). La clave se guarda en ~/.ikigai-demo/administrador.txt
CUENTAS="$("${COMPOSE[@]}" exec -T db psql -U ikigai -d ikigai -tAc "SELECT count(*) FROM users" | tr -d '[:space:]')"
if [ "$CUENTAS" = "0" ]; then
  CLAVE="Demo-$(openssl rand -hex 4)-$(openssl rand -hex 4)"
  "${COMPOSE[@]}" run --rm -e ADMIN_EMAIL=admin@ikigai.demo -e ADMIN_PASSWORD="$CLAVE" -e ADMIN_MUST_CHANGE_PASSWORD=1 \
    api node dist/scripts/create-admin.js >/dev/null
  printf 'Usuario: admin@ikigai.demo\nClave temporal (pide cambiarla al entrar): %s\n' "$CLAVE" > "$DEMO/administrador.txt"
  echo "Administrador creado: ver $DEMO/administrador.txt"
fi

# ---- 6. comprobacion por la direccion publica
if [ -z "${DEMO_URL_FALSA:-}" ]; then
  curl -fsS "$URL/healthz" >/dev/null && echo "OK: $URL/healthz responde." || echo "AVISO: $URL/healthz todavia no responde (a veces tarda unos segundos)."
  curl -fsS "$URL/.well-known/assetlinks.json" | grep -q sha256_cert_fingerprints && echo "OK: assetlinks.json publicado." || echo "AVISO: assetlinks.json no se sirve."
fi

# ---- 7. APK apuntada a esta direccion + landing/app.json
if [ "${SIN_APK:-0}" != 1 ] && [ -z "${DEMO_URL_FALSA:-}" ]; then
  bash "$REPO/apk/build-apk.sh" "$HOST" "${VERSION_APK:-0.9.0}" "${CODIGO_APK:-$(date +%y%m%d%H)}"
fi

cat <<EOF

========================================================================
 La demo esta en:  $URL
 Administrador:    $(cat "$DEMO/administrador.txt" 2>/dev/null | head -1 || true)
 Siguiente paso:   subir landing/ a Cloudflare Pages (docs/DEMO_GRATIS.md, paso 5).
 Si apagas la computadora o el tunel, la direccion deja de existir: al volver a
 levantarla hay que correr este script de nuevo y volver a subir landing/.
========================================================================
EOF
