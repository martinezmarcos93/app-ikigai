<!-- PUNTO-DE-CONTROL -->
**Tarea actual (09/11):** cobros (ADR-003): vencimiento general 10 (o el día de alta si se anotó después) + editable por persona, tolerancia 2 días, propuestas de recargo (% de la deuda) que aprueba el admin, recordatorios push con monto. Rama `feat/vencimientos-recargos`, revisión hecha (integrar con cambios) y correcciones aplicadas.

**Próximo paso:** PR → OK de Marcos → merge → `INTERNAL_JOB_TOKEN` (en `~/.ikigai-signing/internal-job-token`) en el environment group de Render y como secreto del Worker → deploy de Render → verificar → Agustín configura el % y los vencimientos.

**Antes de cargar un % de recargo en producción:** confirmar con Agustín la base del recargo (hoy: saldo deudor total, incluye deuda vieja y recargos previos → recargo sobre recargo). Alternativa: solo la cuota del mes.

**Ojo tests:** usar una base PostgreSQL NUEVA; reusarla entre corridas hace fallar tests de agenda por datos acumulados.

**Abierto con Agustín:** ¿la cuota mensual la genera la app (§6 del ADR) o sigue manual? Mientras sea manual, sin cargo cargado no hay propuesta de recargo.

**Diferido de la revisión (BAJA):** recordatorios no se recuperan si la tarea no corrió ese día.

**Bloqueos / pendientes:**
- **Incidente 429 repetido (10/11):** el Cloudflare de Render volvió a desafiar ("Just a moment...") ahora a `api.ikigai-training.com` (el 07/11 fue a `*.onrender.com`). Se levantó solo en minutos; `onrender.com` andaba desde el Worker (versión de prueba `8a26d0f6` al 0 %, ya retirada). Arreglo: **PR #47** (`fix/worker-failover-desafio`): el Worker pasa a la dirección de respaldo ante el desafío o un error 52x, avisa en los logs (`ALERTA api:`) y los crons usan User-Agent propio. Probado en Cloudflare al 0 % del tráfico. Mergeado a `main` el 10/11 (`7324bd0`). Falta: crear los 2 monitores externos (`docs/DEPLOY_WORKER.md`).
- Copia de `~/.ikigai-signing/` fuera de la PC (clave APK, VAPID, token interno).
- Rotar la contraseña de Neon y actualizar `DATABASE_URL` en Render.
- Render no despliega solo (desde el 12/10).
- 8 apodos en espera y 11 sin correspondencia. ¿Dominadas en reps? ¿Empates comparten puesto?
<!-- /PUNTO-DE-CONTROL -->
