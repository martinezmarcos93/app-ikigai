# Reporte — Encargo 010

## Estado

Implementación de contrato servidor Iron Pixel V2 completada.

## Cambios

- Se corrigió el techo de PERFECT de bench a 120, igual al techo total, porque la barra se acelera según las repeticiones de todo el circuito y el orden de pruebas cambia.
- Se conservaron los CHECK de `reps`, `perfect_reps` y `score`: con los límites V2, sus rangos existentes alcanzan. La migración agrega versión, peso y detalle.
- Los tests unitarios verifican combos, pesos y los límites por ejercicio.
- Se reescribieron las partidas de integración usando secuencias cortas con puntajes calculados y `pointsForRun`, para cubrir crédito completo, recorte por tope y rechazo.
- Las rutas y documentación describen cierre V2, rechazo de clientes V1, y ranking/records solo V2.

## Verificación

- `git diff --check`: correcto.
- El oráculo indicado se bloqueó al ejecutar `docker exec`: `permission denied while trying to connect to the Docker API at unix:///var/run/docker.sock`. No se pudo recrear la base, migrar ni correr `npm test`.
- No se creó commit porque el encargo exige correr el oráculo antes de commitear.

## Propuestas

- La skill `delegacion-opencode` no está disponible dentro del worktree. Por la restricción de no acceder a rutas externas, no se leyó desde otra ubicación.
