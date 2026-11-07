<!-- PUNTO-DE-CONTROL -->
**Tarea actual:** ninguna en curso. Ranking de fuerza con apodos + Iron Pixel V2 en producción desde el 07/11/2026 (API Render `9434080`, portal Cloudflare `43d72fdc`). Mensaje para el grupo del gimnasio entregado a Marcos.

**Estado verificado (07/11, cierre):** `main` limpio y al día; servidor 137/137 con PostgreSQL limpio, cliente 30/30, Worker 10/10, first-run OK. «Publish Worker» en verde: el secreto `CLOUDFLARE_API_TOKEN` ya funciona (cada push a `main` publica el portal).

**Próximo paso:** próxima actualización (ver preguntas). Primero, con el próximo push que toque `server/`, confirmar en Render → Events que el deploy se dispara solo (Marcos reconectó la app de Render en GitHub el 07/11; sin verificar todavía).

**Bloqueos:** ninguno.

**Pendientes de otros:**
- Agustín: confirmar los 8 apodos en espera y los 11 sin correspondencia; se cargan con `server/scripts/import-strength-marks.ts` (CSV fuera del repo).
- Marcos recuperar su usuario de la app (doomhammer): no se resolvió en esta sesión.

**Decisiones:** Marcos decidió no rotar la contraseña de Neon (07/11).

**Preguntas abiertas (próxima actualización):** ¿Dominadas se mide en repeticiones (valores 1–10)? Hoy dice kg. ¿Empates comparten puesto?
<!-- /PUNTO-DE-CONTROL -->
