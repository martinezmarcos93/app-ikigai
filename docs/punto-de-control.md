<!-- PUNTO-DE-CONTROL -->
**Tarea actual (10/11):** ninguna en curso. Incidente 429 cerrado: el Cloudflare de Render desafió `api.ikigai-training.com` (el 07/11, `onrender.com`). PR #47 en producción (Worker `e7ec5c0a`): reintenta por `API_ORIGIN_FALLBACK` ante desafío/fallo/52x, `503 api_blocked` si todo está bloqueado, `ALERTA api:` en logs. Monitores UptimeRobot activos con alerta por mail: «Ikigai – login usuarios» y «Ikigai – API principal». Ver `docs/DEPLOY_WORKER.md` y `docs/handoffs/2026-11-10.md`.

**Próximo paso:** cuota mensual automática, editable cada mes (general y por persona). Antes de cargar un % de recargo: Agustín confirma la base (hoy saldo deudor total → recargo sobre recargo).

**Si llega una alerta:** monitor «login usuarios» = nadie entra (actuar ya). Solo «API principal» = el respaldo cubre; mirar `ALERTA api:` en los logs del Worker.

**Ojo tests:** base PostgreSQL NUEVA por corrida (datos acumulados rompen tests de agenda).

**Bloqueos / pendientes:**
- Consulta a soporte de Render por el desafío anti-bots (sin mandar).
- Borrar la rama mergeada `fix/worker-failover-desafio` (OK de Marcos).
- Copia de `~/.ikigai-signing/` fuera de la PC (clave APK, VAPID, token interno).
- Rotar la contraseña de Neon y actualizar `DATABASE_URL` en Render.
- Recordatorios de cobro no se recuperan si la tarea diaria no corrió ese día (BAJA).
- 8 apodos en espera y 11 sin correspondencia.

**Preguntas abiertas:** ¿Dominadas en reps? ¿Empates comparten puesto?
<!-- /PUNTO-DE-CONTROL -->
