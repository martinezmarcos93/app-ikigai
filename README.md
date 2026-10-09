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

## Portal conectado a la API

El archivo [portal.html](portal.html) es una primera interfaz conectada al backend. Usa sesiones del servidor, cookie HttpOnly y token CSRF en memoria; no lee ni escribe los datos de la demo local. Incluye vistas iniciales de miembros, servicios, membresías, cuenta corriente, profesores y generación de invitaciones. Los permisos siguen siendo validados por la API.

Para probarlo en desarrollo:

1. Instalá y ejecutá PostgreSQL y seguí los pasos de [server/README.md](server/README.md) para migrar la base y crear el primer administrador.
2. En una terminal ejecutá `cd server && npm run dev`.
3. En otra terminal, desde la raíz del repositorio, ejecutá `python -m http.server 8000`.
4. Abrí http://localhost:8000/portal.html. En localhost, el portal apunta por defecto a la API en el puerto 3001.

La creación de invitaciones devuelve un token de un solo uso que debe entregarse por un canal seguro. No uses datos reales hasta completar revisión de seguridad, pruebas de recuperación y configuración operativa.

## Backend en desarrollo

La API está en [`server/`](server/README.md). Incluye Node.js 22, TypeScript estricto, Fastify, PostgreSQL y migraciones transaccionales; login con contraseña scrypt, sesiones revocables y protección CSRF/origen; lectura y edición de perfiles con autorización por rol; reservas transaccionales con corte de 40 minutos, capacidad y lista de espera; cuenta corriente con movimientos idempotentes y auditoría; obligaciones mensuales fijas de profesores con pagos parciales y ajustes; asistencia histórica y rutinas versionadas con permisos de alcance. La integración con la interfaz de la demo aún no está hecha.

La API sigue siendo una fundación en desarrollo, no está aprobada para datos reales. Faltan recuperación de contraseña, limitación de intentos compartida entre réplicas, ampliación de pruebas de autorización, restauración de backups ensayada, monitoreo y despliegue seguro. Ejecutá `npm run check`, `npm test`, `npm run build` y `npm run db:migrate` desde `server/` contra una base descartable.

## Credenciales y límites

No hay inicio de sesión real ni separación de permisos segura: el selector de rol es sólo para recorrer la demo. Los datos son ficticios y se guardan en el navegador. Las notificaciones son internas de la demo; no se envían push, email ni WhatsApp. La asistencia se guarda como historial dentro del estado local del navegador, pero todavía no cuenta con una base compartida ni con auditoría de servidor. No usar importes de profesores, saldos ni datos de ejemplo para operar el gimnasio.

## Enfoque Android-first

La rama `feat/android-first-product-foundation` incorpora mejoras iniciales para pantallas compactas, objetivos táctiles, áreas seguras, navegación móvil accesible y una base PWA instalable con caché del shell estático. La caché no sincroniza datos entre dispositivos ni convierte `localStorage` en almacenamiento multiusuario.

## Hoja de ruta

Consultar [`docs/PRODUCT_PLAN.md`](docs/PRODUCT_PLAN.md), [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md), [`docs/ACCEPTANCE_TESTS.md`](docs/ACCEPTANCE_TESTS.md) y [`docs/BACKEND_SECURITY_PLAN.md`](docs/BACKEND_SECURITY_PLAN.md) para las decisiones de producto, el modelo de datos y las pruebas de aceptación. La demo del navegador sigue siendo local y todavía no consume la API. La carpeta [server/](server/README.md) contiene la API separada. La demo local no consume todavía esta API. No usar datos reales hasta cerrar los pendientes de seguridad, completar los flujos y verificar la operación.
