#!/usr/bin/env bash
# Publica el Worker de app.ikigai-training.com (portal + proxy a la API + aviso para que Render no se duerma).
#
#   bash deploy/worker/publicar.sh
#
# Usa wrangler instalado en ~/src/ikigai-deploy (el mismo que publica la landing). Idempotente.
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
WRANGLER="${IKIGAI_DEPLOY_TOOLS:-$HOME/src/ikigai-deploy}/node_modules/.bin/wrangler"
[ -x "$WRANGLER" ] || { echo "Falta wrangler en $WRANGLER (corré deploy/publicar-landing.sh una vez para instalarlo)." >&2; exit 1; }
node --test "$AQUI/test/worker.test.mjs" >/dev/null || { echo "Fallaron los tests del Worker: no se publica." >&2; exit 1; }
node "$AQUI/build.mjs" >/dev/null
cd "$AQUI" && "$WRANGLER" deploy
