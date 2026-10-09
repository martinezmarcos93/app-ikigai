# Ikigai Training API — foundation

Este backend es una primera base ejecutable, no una autorización para operar con datos reales. La PWA local sigue separada y todavía no consume esta API.

## Requisitos

- Node.js 22 o superior.
- PostgreSQL 15 o superior.
- Variables de entorno configuradas desde un gestor de secretos en producción.

## Desarrollo local

1. Copiar `.env.example` a `.env` y configurar `DATABASE_URL` y un `SESSION_PEPPER` aleatorio de al menos 32 caracteres.
2. Crear una base vacía de desarrollo.
3. Ejecutar la migración inicial con una herramienta SQL revisada:
   `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/001_initial_schema.sql`
4. Instalar dependencias con `npm install`.
5. Ejecutar `npm run typecheck`, `npm test` y `npm run dev`.

No hay todavía un flujo de alta inicial de administradores. No insertar usuarios con contraseñas débiles ni exponer un endpoint público de registro. La creación del primer administrador debe realizarse mediante un procedimiento operativo controlado, que se implementará antes de desplegar.

## Estado de implementación

La fundación inicial está escrita y dispone de pruebas con dobles de la base de datos y un workflow que aplica el esquema a PostgreSQL real. No se considera validada hasta que ese workflow termine correctamente. No existe integración frontend-backend ni procedimiento de aprovisionamiento de usuarios; por tanto, todavía no es desplegable para uso del gimnasio.

## Endpoints actuales

- `GET /healthz`: estado básico del proceso; no informa secretos ni detalles de infraestructura.
- `POST /api/v1/auth/login`: inicia sesión y emite una cookie opaca `HttpOnly`.
- `POST /api/v1/auth/logout`: invalida la sesión actual.
- `GET /api/v1/auth/me`: devuelve la identidad autenticada.
- `GET /api/v1/members`: devuelve miembros según el rol y alcance.
- `GET /api/v1/members/:id`: oculta los recursos ajenos como 404.

Las operaciones que modifican estado validan el encabezado `Origin` contra `APP_ORIGIN`. La cookie de sesión usa `SameSite=Strict`, `HttpOnly` y `Secure` en producción. El identificador de sesión se genera aleatoriamente; sólo su hash se persiste. El rate limit inicial es por proceso y debe complementarse con límites en el proxy/edge para despliegues con múltiples réplicas.

## Límites y pendientes de seguridad

- El endpoint de salud comprueba el proceso, no la disponibilidad de PostgreSQL.
- No existe todavía alta segura de usuarios, invitaciones, recuperación de contraseña, MFA ni revocación administrativa de sesiones.
- No se implementaron endpoints de escritura de miembros, reservas, asistencia, finanzas o rutinas.
- No hay todavía auditoría automática conectada a las mutaciones porque las rutas de escritura no están implementadas.
- Las migraciones no deben ejecutarse automáticamente al arrancar el servidor.
- Antes de producción: TLS verificado, límites distribuidos, política de backups y restauración ensayada, alertas, retención de logs, revisión de privacidad y pruebas de integración/penetración.
- Nunca cargar datos reales hasta cerrar los pendientes de seguridad y completar las pruebas de autorización.
