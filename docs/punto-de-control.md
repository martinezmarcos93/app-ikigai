<!-- PUNTO-DE-CONTROL -->
**Tarea actual (09/11):** cobros (ADR-003): vencimiento general 10 + propio por persona, tolerancia 2 días, propuestas de recargo (% de la deuda) que aprueba el admin, recordatorios push con monto. Rama `feat/vencimientos-recargos` (worktree `~/src/ikigai-push`), 5 commits, en revisión. Tests 149/149 x3 con base nueva.

**Próximo paso:** revisión → PR → merge → `INTERNAL_JOB_TOKEN` (generado en `~/.ikigai-signing/internal-job-token`) en Render (environment group) y como secreto del Worker → deploy de Render → verificar → Agustín configura el % de recargo y los vencimientos propios.

**Ojo tests:** usar una base PostgreSQL NUEVA; reusarla entre corridas hace fallar tests de agenda por datos acumulados.

**Abierto con Agustín:** ¿la cuota mensual la genera la app (§6 del ADR) o sigue manual? Mientras sea manual, sin cargo cargado no hay propuesta de recargo.

**Bloqueos / pendientes:**
- Copia de `~/.ikigai-signing/` fuera de la PC (clave APK, VAPID, token interno).
- Rotar la contraseña de Neon y actualizar `DATABASE_URL` en Render.
- Render no despliega solo (desde el 12/10).
- 8 apodos en espera y 11 sin correspondencia. ¿Dominadas en reps? ¿Empates comparten puesto?
<!-- /PUNTO-DE-CONTROL -->
