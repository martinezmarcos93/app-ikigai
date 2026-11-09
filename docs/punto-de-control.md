<!-- PUNTO-DE-CONTROL -->
**Tarea actual (09/11):** avisos como notificación push en el celular. Rama `feat/avisos-push` (worktree `~/src/ikigai-push`), sin commitear todavía.

**Hecho:** Web Push estándar sin dependencias (`server/src/domain/web-push.ts`: VAPID + cifrado RFC 8291), tabla `push_subscriptions` (0018), rutas `/api/v1/push/*`, envío al publicar un aviso (mismos destinatarios que en el portal, sin el autor, solo accesos activos), panel «Notificaciones» en Avisos, service worker v26, baja del dispositivo al cerrar sesión y al anonimizar. APK: `enableNotifications: true`. Tests 143/143 (dos corridas).

**Próximo paso:** commit + PR → `npm run push:keys` y cargar `VAPID_*` en Render → deploy → recompilar APK (versión nueva, misma clave) → probar en Android real y en un iPhone con la app agregada a inicio.

**iPhone:** solo iOS 16.4+ y con la app agregada a la pantalla de inicio desde Safari; el portal lo explica en la sección Avisos.

**Bloqueos / pendientes:**
- Fechas de pago + tolerancia + penalización: faltan las reglas de Agustín (hoy los cargos son manuales y no hay vencimientos).
- Rotar la contraseña de Neon (`neondb_owner`) y actualizar `DATABASE_URL` en Render.
- Render no despliega solo (desde el 12/10).
- 8 apodos en espera y 11 sin correspondencia.

**Preguntas abiertas:** ¿Dominadas en repeticiones? ¿Empates comparten puesto?
<!-- /PUNTO-DE-CONTROL -->
