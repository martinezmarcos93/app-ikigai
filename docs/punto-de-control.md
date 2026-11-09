<!-- PUNTO-DE-CONTROL -->
**Tarea actual (09/11):** notificaciones push de avisos EN PRODUCCIÓN (PR #45, `ba2468c`). API con `VAPID_*` desde un environment group de Render (verificado: `/api/v1/push/config` → enabled, clave pública coincide con `~/.ikigai-signing/vapid.env`). Portal publicado (service worker v26). Landing con APK 1.1.0 (versionCode 2, hash verificado).

**Próximo paso:** Marcos prueba en su Android: primero con la APK 1.0.0 (¿llega la prueba? ¿como Ikigai o como Chrome?) y después con la 1.1.0. Según eso, decidir si hay que pedirles a los miembros que actualicen la APK. Después probar en un iPhone (app agregada a inicio, iOS 16.4+).

**Siguiente tarea:** vencimientos + tolerancia + recargo con aprobación del admin + recordatorios push (respuestas en `docs/reglas-cobro-respuestas-agustin.md`; 2 dudas abiertas: ¿cuota mensual automática o manual? ¿«cargo fijo» = monto o %?). Requiere ADR.

**Bloqueos / pendientes:**
- Claves VAPID: hacer copia de `~/.ikigai-signing/` fuera de la PC (si se pierden, todos reactivan notificaciones).
- Rotar la contraseña de Neon (`neondb_owner`) y actualizar `DATABASE_URL` en Render.
- Render no despliega solo (desde el 12/10).
- 8 apodos en espera y 11 sin correspondencia.

**Preguntas abiertas:** ¿Dominadas en repeticiones? ¿Empates comparten puesto?
<!-- /PUNTO-DE-CONTROL -->
