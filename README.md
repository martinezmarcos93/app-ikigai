# Ikigai Training

Aplicación en desarrollo para la gestión de un gimnasio. El repositorio mantiene dos superficies diferenciadas: una demo local navegable y un portal inicial conectado a una API multiusuario.

## Estado y hoja de ruta

La hoja de ruta canónica es [docs/ROADMAP_IMPLEMENTATION.md](docs/ROADMAP_IMPLEMENTATION.md). Define el orden de implementación, criterios de cierre, riesgos conocidos y estado de cada área. El trabajo se ejecuta por fases; no se adelantan cambios de identidad visual ni se declara terminada una función sin pruebas.

Documentación relacionada:

- [Plan de producto y reglas del negocio](docs/PRODUCT_PLAN.md)
- [Modelo de datos](docs/DATA_MODEL.md)
- [Pruebas de aceptación](docs/ACCEPTANCE_TESTS.md)
- [Plan de seguridad del backend](docs/BACKEND_SECURITY_PLAN.md)
- [Documentación de la API](server/README.md)

## Demo local

Abrí `index.html` en un navegador moderno o ejecutá desde la raíz:

```bash
python -m http.server 8000
```

Luego entrá a http://localhost:8000. La demo utiliza HTML, CSS y JavaScript sin backend; persiste cambios en el `localStorage` del navegador y permite restaurar datos de prueba. Sus datos y selector de rol son exclusivamente demostrativos.

La demo contiene vistas de miembros, cuentas corrientes, obligaciones mensuales fijas de profesores, agenda, reservas, lista de espera, asistencia, ejercicios/rutinas, avisos y perfiles. Su presencia en la interfaz no implica que los flujos estén integrados con la API.

## Portal conectado a la API

`portal.html` ofrece una primera interfaz conectada al backend. Usa sesiones del servidor, cookie HttpOnly y token CSRF en memoria; no comparte el almacenamiento local de la demo. Incluye vistas iniciales para miembros, servicios, membresías, cuentas corrientes, profesores e invitaciones.

Para desarrollo, seguí [server/README.md](server/README.md): requiere Node.js 22 y PostgreSQL. En terminales separadas, ejecutá la API desde `server/` y el servidor estático desde la raíz; después abrí http://localhost:8000/portal.html. En localhost el portal apunta por defecto a la API en el puerto 3001.

## Backend y validaciones

La API usa TypeScript, Fastify y PostgreSQL. Incluye una primera implementación de autenticación, sesiones revocables, protección CSRF/origen, autorización por rol y alcance, reservas transaccionales, cuenta corriente, asistencia, rutinas versionadas y obligaciones mensuales de profesores.

El workflow de GitHub Actions verifica sintaxis de JavaScript, reglas de producto, el manifiesto PWA, TypeScript, tests, build y migraciones contra PostgreSQL. El backend versiona `server/package-lock.json` y CI usa `npm ci` para instalar las dependencias de forma reproducible.

Antes de usar datos reales faltan, entre otros puntos, ampliar las pruebas de autorización, recuperación de contraseña, limitación de intentos compartida entre instancias, revisión de seguridad, backups y restauración ensayada, monitoreo y despliegue seguro. Ejecutá `npm run check`, `npm test`, `npm run build` y `npm run db:migrate` desde `server/` contra una base descartable.

## Reglas del negocio que no deben alterarse accidentalmente

- La obligación de cada profesor con el gimnasio es mensual, fija e independiente de reservas o asistencia; no hay reparto porcentual.
- Los importes mensuales de profesores permanecen sin configurar hasta que se acuerden explícitamente; se admiten pagos parciales y saldos a favor.
- Los movimientos financieros mantienen historial; cambiar una tarifa no reescribe cargos o pagos anteriores.
- Las reservas respetan el corte de 40 minutos y la capacidad configurada; la lista de espera no consume cupos confirmados.
- No se incorporan multas automáticas no aprobadas.
- La autorización efectiva se valida en el servidor.
- El logo existente y la identidad visual oscura/roja son la referencia de marca. La Fase 2 debe inspeccionar y medir el original antes de crear variantes o modificar colores.
- No cargar datos reales ni tratar el prototipo como sistema de producción.
