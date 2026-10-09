# Ikigai Training — Demo local

Prototipo navegable de administración de gimnasio, con estilo basado en la identidad visual de Ikigai Training (negro, rojo y tipografía condensada).

## Abrir la demo

Opción directa: abrí `index.html` en un navegador moderno.

Opción recomendada: desde esta carpeta ejecutá uno de estos comandos:

```bash
python -m http.server 8000
```

Después entrá a http://localhost:8000.

No requiere instalar dependencias. Usa HTML, CSS y JavaScript sin backend. Los cambios quedan guardados en `localStorage` del navegador utilizado. El botón **Reiniciar datos de prueba** restaura los datos iniciales.

## Qué puede probarse

- Cambio entre vista de administrador y miembro.
- Panel de resumen con miembros, deudas, turnos, cupos y avisos.
- Alta/edición de miembros, búsqueda/filtros y exportación a CSV.
- Cuentas corrientes de miembros: cargos, pagos, saldos y movimientos.
- Obligaciones mensuales de profesores al gimnasio, con pagos parciales y saldo por período (demo; importes sin configurar por defecto).
- Agenda por fecha, capacidad configurable por franja, reservas, lista de espera y promoción automática al liberar cupos.
- Registro histórico de asistencia por reserva y fecha.
- Catálogo y edición de rutinas/ejercicios.
- Perfiles de profesores y obligación mensual fija por uso del espacio; no se calculan porcentajes por reserva.
- Publicación de avisos y registro de ausencias/llegadas tarde.
- Diseño responsive para teléfono, tablet y escritorio.

## Backend en desarrollo

La base inicial de la API está en [`server/`](server/README.md): Node.js 22, TypeScript, Fastify, validación de configuración, cabeceras de seguridad, CORS por lista permitida, endpoints de salud, login local con scrypt, sesiones revocables y CSRF, lectura de perfiles por rol, reservas/cancelaciones transaccionales con lista de espera y migraciones PostgreSQL. Para ejecutar los checks, consultá `server/README.md`. Ya existen login/sesiones, lectura de perfiles con alcance por rol y una primera API transaccional de reservas; ya existe escritura de perfil con auditoría y límites por rol, y una primera API de cuenta corriente con movimientos idempotentes; todavía faltan membresías, obligaciones de profesores, asistencia y rutinas. No es apta para operar con datos reales.

## Credenciales y límites

No hay inicio de sesión real ni separación de permisos segura: el selector de rol es sólo para recorrer la demo. Los datos son ficticios y se guardan en el navegador. Las notificaciones son internas de la demo; no se envían push, email ni WhatsApp. La asistencia se guarda como historial dentro del estado local del navegador, pero todavía no cuenta con una base compartida ni con auditoría de servidor. No usar importes de profesores, saldos ni datos de ejemplo para operar el gimnasio.

## Enfoque Android-first

La rama `feat/android-first-product-foundation` incorpora mejoras iniciales para pantallas compactas, objetivos táctiles, áreas seguras, navegación móvil accesible y una base PWA instalable con caché del shell estático. La caché no sincroniza datos entre dispositivos ni convierte `localStorage` en almacenamiento multiusuario.

## Hoja de ruta

Consultar [`docs/PRODUCT_PLAN.md`](docs/PRODUCT_PLAN.md), [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md), [`docs/ACCEPTANCE_TESTS.md`](docs/ACCEPTANCE_TESTS.md) y [`docs/BACKEND_SECURITY_PLAN.md`](docs/BACKEND_SECURITY_PLAN.md) para las decisiones de producto, el modelo de datos y las pruebas de aceptación. La demo sigue siendo local: no usar datos reales hasta implementar backend, autenticación, autorización del lado servidor, base de datos compartida y pruebas.
