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

# Crea el proyecto la primera vez (si ya existe, el error se ignora).
"$WRANGLER" pages project create "$PROYECTO" --production-branch main >/dev/null 2>&1 || true

"$WRANGLER" pages deploy "$REPO/landing" --project-name "$PROYECTO" --branch main --commit-dirty=true
echo
echo "Landing publicada: https://$PROYECTO.pages.dev"
python3 - "$REPO/landing/app.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1], encoding="utf-8"))
print("App (demo):       ", d.get("appUrl") or "(sin direccion)")
a = d.get("apk")
print("APK publicada:    ", f"{a['version']} · {a['sizeMB']} MB · {a['sha256'][:12]}…" if a else "(todavia no hay)")
PY
