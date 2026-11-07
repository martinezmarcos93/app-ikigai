<!-- PUNTO-DE-CONTROL -->
**Tarea actual:** ninguna en curso. Incidente del 07/11 resuelto: el login daba "HTTP 429" a todos.

**Causa y arreglo (07/11):** el Cloudflare de Render empezó a desafiar ("Just a moment...", `cf-mitigated: challenge`) los pedidos del Worker a `ikigai-api-q17j.onrender.com`. Se creó el dominio propio `api.ikigai-training.com` (custom domain en Render + CNAME en Cloudflare, nube gris) y el Worker apunta ahí (`API_ORIGIN`, versión `34cfc804`). Verificado: `/api/v1/health` 200 y login 401 JSON a través de `app.ikigai-training.com`. Rama `fix/worker-api-dominio-propio`, sin merge a `main`.

**Próximo paso:** merge de la rama a `main` (OK de Marcos); probar con usuarios reales en un celular.

**Bloqueos / pendientes:**
- Rotar la contraseña de Neon (`neondb_owner`) y actualizar `DATABASE_URL` en Render: quedó expuesta en una sesión de chat.
- Secreto `CLOUDFLARE_API_TOKEN` (cuenta doomhammer) en GitHub: sin él, el workflow «Publish Worker» falla en cada push y hay que publicar con `bash deploy/worker/publicar.sh`.
- Render no despliega solo (desde el 12/10): reconectar la app de Render en GitHub.
- 8 apodos en espera y 11 sin correspondencia (ver la planilla del gimnasio).

**Preguntas abiertas:** ¿Dominadas se mide en repeticiones (valores 1–10)? Hoy el ranking dice kg. ¿Empates comparten puesto?
<!-- /PUNTO-DE-CONTROL -->
