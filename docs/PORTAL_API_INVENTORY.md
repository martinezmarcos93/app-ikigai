# Inventario de integración portal/API — Fase 4

**Estado:** barrido inicial documentado; no equivale a aceptación funcional ni a aprobación de seguridad.  
**Rama base:** `main`; **barrido actual:** `feat/phase-4-schedule-api-sweep`  
**Fuente de verdad:** el portal conectado consulta la API; la demo `index.html` continúa siendo local y usa `localStorage`.

## Estados

- **Conectado:** la pantalla llama a la API para el flujo descrito.
- **Parcial:** existe lectura o escritura, pero faltan acciones, pruebas de contrato o cobertura de roles.
- **Pendiente:** no existe un flujo utilizable en el portal conectado.
- La visibilidad de una opción en el navegador es sólo UX; la autorización real corresponde al backend.

## Inventario por superficie

| Superficie / flujo | Estado observado | Cliente API / comportamiento | Trabajo pendiente |
| --- | --- | --- | --- |
| Inicio de sesión | Conectado | `login()`, `me()`, `logout()`; cookie de sesión, CSRF en memoria y `credentials: include` | Pruebas de contrato de sesión expirada, logout y origen no permitido |
| Resumen de administración | Parcial | Lee miembros, servicios y profesores | Evitar que el fallo de un recurso deje toda la vista sin diagnóstico específico; probar payloads vacíos y errores 401/403/5xx |
| Miembros | Parcial | Lista paginada en páginas de 25 registros, alta, consulta y edición; el offset se envía a la API y no se simula en memoria | Ejecutar pruebas de navegación anterior/siguiente, páginas vacías, 403/404 y cambios de total; confirmar que un error no se presenta como éxito |
| Servicios | Parcial | Listado, alta y actualización | Pruebas de contrato para precio nulo, activo/inactivo y preservación de precios históricos |
| Membresías | Parcial | Historial por miembro, alta y finalización | Probar selector de miembro, vigencias, conflictos y ausencia de cargos automáticos |
| Cuenta corriente | Parcial | Lectura de movimientos/saldo y alta de movimientos con clave de idempotencia | Probar reintentos, doble envío, ajustes debit/credit, pagos parciales y saldos a favor |
| Profesores | Parcial | Directorio, alta y consulta de obligación mensual | Probar períodos no configurados, pagos parciales, ajustes, idempotencia y separación de roles |
| Invitaciones / accesos | Parcial | Crear invitación y mostrar token una sola vez; el backend también expone revocar, reenviar y restablecer acceso | Verificar qué acciones tienen UI y cubrir expiración, revocación y entrega segura; no persistir el token en almacenamiento local |
| Mi rutina | Conectado en lectura | El portal consulta asignaciones del miembro y muestra ejercicios/versión | Añadir pruebas de contrato y revisar estados de error/ausencia de asignaciones |
| Asistencia | Parcial | El miembro puede consultar su historial; el cliente también expone escritura de asistencia por instancia | La UI de administración/profesor para seleccionar clase y corregir asistencia no está conectada; probar historial propio y permisos |
| Agenda / reservas / lista de espera | API de lectura y UI conectadas parcialmente | `GET /api/v1/class-sessions` expone sesiones programadas por ventana temporal y paginación; incluye servicio, profesor, cupo, ocupación, lista de espera y estado de reserva propia; la lectura limita el rango a 90 días y aplica alcance de profesor | Ejecutar tests/typecheck/CI y pruebas PostgreSQL; probar por rol y estados de cupo/espera; falta UI para crear/editar plantillas/instancias; no simular persistencia |
| Avisos y notificaciones | Pendiente | Sin flujo de entrega validado en el portal | Definir proveedor, consentimiento y operación antes de habilitar |
| Demo local `index.html` | Local por diseño | Usa `localStorage` y datos demostrativos | Mantener separada del portal; nunca indicar que sus cambios se sincronizaron con la API |

## Contrato transversal observado

- `api-client.js` concentra la URL base, el envío JSON, las cookies de sesión, CSRF, `cache: no-store` y la normalización de errores en `ApiError`.
- Las escrituras no se reintentan automáticamente. En los formularios financieros, la clave idempotente queda asociada en memoria al formulario y al payload: se conserva si se repite el mismo envío tras un error incierto y cambia si cambia el payload. La clave no se persiste en `localStorage`.
- La sesión y el token CSRF viven en memoria del cliente; no deben copiarse a `localStorage`, URL, logs ni telemetría.
- Las vistas deben distinguir carga, estado vacío, falta de permisos, sesión vencida y error de red/servidor. No conservar como “actualizados” datos antiguos tras fallar una escritura.
- No se debe cambiar el contrato de respuesta del servidor desde el frontend por conveniencia. Si un endpoint no cumple el contrato esperado, corregirlo con pruebas del lado API.

## Avance de este barrido

En la rama `feat/phase-3-closeout-phase-4-integration`:

- Se añadieron cinco contratos automatizados en `scripts/test-api-client.mjs`: sesión expirada/limpieza de CSRF, limpieza al fallar logout, normalización de error no JSON, métodos de servicios/ajustes institucionales y contratos de servicios/configuración institucional.
- Se añadió un sexto contrato que comprueba creación y cancelación de reservas con método, ruta codificada, CSRF y `cache: no-store`.
- `api-client.js` expone ahora `createBooking(sessionId)` y `cancelBooking(bookingId)` conforme a las rutas reales registradas en `server/src/routes/bookings.ts`. Esto no significa que la agenda esté integrada de extremo a extremo: falta lectura/gestión de instancias y UI.
- Se creó `docs/CLAUDE_CODE_PHASES_4_5_6_HANDOFF.md` con un plan de implementación ejecutable para Claude Code, cubriendo integración portal/API, reservas/asistencia/finanzas, PWA Android y gates de seguridad/preproducción.
- El resumen de administración y el panel del miembro ahora cargan sus recursos con `Promise.allSettled`: un fallo aislado no oculta los recursos que sí respondieron; una sesión expirada (401) sigue invalidando la vista y exige volver a autenticarse. Se añadieron aserciones estáticas de este comportamiento a `scripts/test-first-run.mjs`; aún deben ejecutarse localmente/CI.
- El service worker excluye las rutas con un segmento `/api` incluso cuando la aplicación se sirve bajo una subruta y se incrementó la caché a `ikigai-shell-v7` para eliminar entradas antiguas potencialmente almacenadas bajo rutas API anidadas. Se actualizaron aserciones estáticas para esa frontera; las pruebas deben ejecutarse y confirmarse en navegador.
- Se actualizó la hoja de ruta con el estado de seguridad/CI y se mantiene el bloqueo de validación externa.

**Estado de ejecución:** los contratos añadidos todavía requieren ejecución local/CI. No se declara que hayan pasado. Las corridas anteriores de GitHub Actions no llegaron a asignar runner, por lo que no constituyen evidencia de que el código haya fallado ni de que haya pasado.


## Actualización del barrido de agenda

La rama `feat/phase-4-schedule-api-sweep` agrega la lectura real de sesiones de clase y el método `listClassSessions` al cliente. La API usa `cache: no-store`, devuelve total/paginación y limita consultas a una ventana de hasta 90 días. El rol profesor queda limitado a sus propias sesiones; administración y miembros con sesión válida pueden consultar la agenda programada. El cliente valida rangos de fechas y límites antes de enviar solicitudes.

**No se considera validado todavía:** faltan typecheck, tests de integración contra PostgreSQL, CI con jobs/steps ejecutados y conexión de la vista del portal. El workflow más reciente sigue mostrando jobs fallidos sin pasos ni logs disponibles; eso no demuestra un fallo de código ni una aprobación.
