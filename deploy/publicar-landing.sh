#!/usr/bin/env bash
# Sube landing/ (con la APK y app.json) a Cloudflare Pages, gratis. Idempotente: sirve para la primera vez y para cada
# version nueva.
#
#   bash deploy/publicar-landing.sh            # publica en https://<proyecto>.pages.dev
#
# Una sola vez hace falta autorizar a wrangler en el navegador (cuenta gratuita de Cloudflare): el script abre la pagina.
# Alternativa sin navegador: exportar CLOUDFLARE_API_TOKEN (permiso «Cloudflare Pages: Edit») y CLOUDFLARE_ACCOUNT_ID.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
PROYECTO="${PAGES_PROYECTO:-ikigai-landing}"
# Cloudflare le agrega un sufijo al crear el proyecto; esta es la direccion definitiva de esta cuenta.
URL_PUBLICA="${PAGES_URL:-https://ikigai-landing-e88.pages.dev}"
TOOLS="${IKIGAI_DEPLOY_TOOLS:-$HOME/src/ikigai-deploy}"
WRANGLER="$TOOLS/node_modules/.bin/wrangler"

if [ ! -x "$WRANGLER" ]; then
  echo ">> Instalando wrangler (herramienta oficial de Cloudflare, MIT/Apache-2.0) en $TOOLS"
  mkdir -p "$TOOLS" && (cd "$TOOLS" && { [ -f package.json ] || npm init -y >/dev/null; } && npm i wrangler@4.149.0 >/dev/null 2>&1)
fi

[ -f "$REPO/landing/app.json" ] || { echo "Falta landing/app.json" >&2; exit 1; }

if ! "$WRANGLER" whoami 2>/dev/null | grep -qiE "associated with the email|account id|logged in"; then
  echo ">> Autorizacion de Cloudflare: se abre el navegador. Inicia sesion (o crea la cuenta gratuita) y toca «Allow»."
  "$WRANGLER" login
fi

# wrangler se ejecuta desde su propia carpeta: dentro del repo se «autoconfigura» y escribe un wrangler.jsonc que
# publicaria el repositorio entero (assets.directory = ".").
cd "$TOOLS"

# Crea el proyecto la primera vez (--force: crea el proyecto de Pages directo; sin el, wrangler delega en Workers y
# falla fuera de una carpeta de sitio). Si ya existe se sigue; cualquier otro error se muestra.
if ! SALIDA="$("$WRANGLER" pages project create "$PROYECTO" --production-branch main --force 2>&1)"; then
  echo "$SALIDA" | grep -qiE "already exists|ya existe|8000002" || { echo "$SALIDA" >&2; exit 1; }
fi

"$WRANGLER" pages deploy "$REPO/landing" --project-name "$PROYECTO" --branch main --commit-dirty=true
echo
echo "Landing publicada: $URL_PUBLICA   (puede tardar un minuto en propagarse la primera vez)"
python3 - "$REPO/landing/app.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1], encoding="utf-8"))
print("App (demo):       ", d.get("appUrl") or "(sin direccion)")
a = d.get("apk")
print("APK publicada:    ", f"{a['version']} · {a['sizeMB']} MB · {a['sha256'][:12]}…" if a else "(todavia no hay)")
PY
