# Inventario de integración portal/API — Fase 4

**Estado:** barrido inicial documentado; no equivale a aceptación funcional ni a aprobación de seguridad.  
**Rama de trabajo:** `feat/phase-4-api-integration`  
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
| Agenda / reservas / lista de espera | Pendiente en el portal conectado | La demo local tiene vistas, pero no deben confundirse con datos persistidos por la API | Integración posterior a confirmar contratos y estado de agenda; no simular persistencia |
| Avisos y notificaciones | Pendiente | Sin flujo de entrega validado en el portal | Definir proveedor, consentimiento y operación antes de habilitar |
| Demo local `index.html` | Local por diseño | Usa `localStorage` y datos demostrativos | Mantener separada del portal; nunca indicar que sus cambios se sincronizaron con la API |

## Contrato transversal observado

- `api-client.js` concentra la URL base, el envío JSON, las cookies de sesión, CSRF, `cache: no-store` y la normalización de errores en `ApiError`.
- Las escrituras no se reintentan automáticamente. En los formularios financieros, la clave idempotente queda asociada en memoria al formulario y al payload: se conserva si se repite el mismo envío tras un error incierto y cambia si cambia el payload. La clave no se persiste en `localStorage`.
- La sesión y el token CSRF viven en memoria del cliente; no deben copiarse a `localStorage`, URL, logs ni telemetría.
- Las vistas deben distinguir carga, estado vacío, falta de permisos, sesión vencida y error de red/servidor. No conservar como “actualizados” datos antiguos tras fallar una escritura.
- No se debe cambiar el contrato de respuesta del servidor desde el frontend por conveniencia. Si un endpoint no cumple el contrato esperado, corregirlo con pruebas del lado API.

## Prioridades del siguiente barrido

1. Completar la comprobación del resto de formularios y contrastar el inventario con pruebas ejecutadas.
2. Endurecer y probar la capa cliente común, incluidos parámetros de paginación y errores.
3. Corregir discrepancias entre navegación, permisos de UX y renderizadores.
4. Añadir pruebas de contrato para los flujos ya conectados, comenzando por sesión, miembros y servicios.
5. Incorporar progresivamente los flujos restantes sólo cuando existan endpoints y pruebas de autorización verificables.

## Evidencia y límites

Este documento se basa en la lectura estática de `portal.html`, `portal.js`, `api-client.js`, los contratos documentados en `server/README.md` y los esquemas visibles de las rutas. No afirma que el portal se haya ejecutado en un navegador ni que los tests de API/CI estén verdes. Antes de usar datos reales siguen siendo obligatorias la validación de seguridad independiente, la ejecución del pipeline y las pruebas con una base descartable.
