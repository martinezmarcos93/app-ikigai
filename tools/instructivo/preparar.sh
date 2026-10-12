#!/usr/bin/env bash
# Deja un entorno DESCARTABLE listo para sacar las capturas: base nueva, administrador de Agustin con clave temporal,
# otro administrador para cargar los datos y el gimnasio de ejemplo importado con todos sus accesos.
#   bash tools/instructivo/preparar.sh && ~/.venvs/croco-script/bin/python tools/instructivo/capturas.py --accesos <archivo que imprime>
# Requisitos: API de desarrollo en :3001 y portal en :8000 (ver docs de desarrollo), contenedor PostgreSQL ikigai-pg,
# y el venv de herramientas ~/.venvs/ikigai-datos (tools/datos/requirements-datos.txt). RUN_DIR: copia de ejecucion del repo.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
RUN_DIR="${RUN_DIR:-$HOME/src/ikigai-run}"
SALIDA="${SALIDA:-/tmp/ikigai-instructivo-accesos}"
PG="${E2E_PG_CONTAINER:-ikigai-pg}"; DB="${E2E_PG_DB:-ikigai_dev}"

cd "$RUN_DIR/server"; set -a; . ./.env; set +a
docker exec "$PG" psql -U ikigai -d "$DB" -qc "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" >/dev/null 2>&1
npm run db:migrate >/dev/null 2>&1
ADMIN_EMAIL=admin.datos@ikigai.test ADMIN_PASSWORD='Datos-Prueba-2026-x' npm run admin:create >/dev/null 2>&1
ADMIN_EMAIL=agustin@ikigai.test ADMIN_PASSWORD='Ikigai-Inicio-2026' ADMIN_MUST_CHANGE_PASSWORD=1 npm run admin:create >/dev/null 2>&1
docker exec "$PG" psql -U ikigai -d "$DB" -qc "UPDATE users SET tour_completed_at=now() WHERE email='admin.datos@ikigai.test'" >/dev/null
rm -rf "$SALIDA"
cd "$REPO/tools/datos"
IKIGAI_USUARIO=admin.datos@ikigai.test IKIGAI_CLAVE='Datos-Prueba-2026-x' ~/.venvs/ikigai-datos/bin/python importar_datos.py \
  plantillas/Planilla-Ikigai-EJEMPLO.xlsx --url http://localhost:8000 --api http://localhost:3001/api/v1 \
  --aplicar --si --crear-accesos --generar-clases 28 --salida "$SALIDA" >/dev/null
ls "$SALIDA"/accesos-*.jsonl
