<!-- PUNTO-DE-CONTROL -->
**Tarea actual:** ninguna en curso. Ranking de fuerza con apodos + Iron Pixel V2 **en producción** desde el 07/11/2026.

**Estado verificado (07/11):** API en Render con el commit `9434080` (migraciones 0015–0017 aplicadas); portal publicado en Cloudflare (versión `43d72fdc`), archivos servidos idénticos a `main`, carga sin errores. Marcas reales cargadas: 70 de 15 personas con `server/scripts/import-strength-marks.ts` (fichas de miembro nuevas para Agustín y Ailin, sin vincular a sus cuentas). Agustín quedó con el apodo "Koi".

**Próximo paso:** probar con usuarios reales en un celular (circuito V2 contra producción, globos de novedades una sola vez).

**Bloqueos / pendientes:**
- Rotar la contraseña de Neon (`neondb_owner`) y actualizar `DATABASE_URL` en Render: quedó expuesta en una sesión de chat.
- Secreto `CLOUDFLARE_API_TOKEN` (cuenta doomhammer) en GitHub: sin él, el workflow «Publish Worker» falla en cada push y hay que publicar con `bash deploy/worker/publicar.sh`.
- Render no despliega solo (desde el 12/10): reconectar la app de Render en GitHub.
- 8 apodos en espera y 11 sin correspondencia (ver la planilla del gimnasio); se cargan con el mismo script cuando se confirmen.

**Preguntas abiertas:** ¿Dominadas se mide en repeticiones (valores 1–10)? Hoy el ranking dice kg. ¿Empates comparten puesto?
<!-- /PUNTO-DE-CONTROL -->
