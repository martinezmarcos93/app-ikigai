# Ikigai Training

Aplicación en desarrollo para la gestión de un gimnasio. El repositorio mantiene dos superficies diferenciadas: una demo local navegable y un portal inicial conectado a una API multiusuario.

## Estado y hoja de ruta

La hoja de ruta canónica es [docs/ROADMAP_IMPLEMENTATION.md](docs/ROADMAP_IMPLEMENTATION.md). Define el orden de implementación, criterios de cierre, riesgos conocidos y estado de cada área. El trabajo se ejecuta por fases; no se adelantan cambios de identidad visual ni se declara terminada una función sin pruebas.

Documentación relacionada:

- [Plan de producto y reglas del negocio](docs/PRODUCT_PLAN.md)
- [Modelo de datos](docs/DATA_MODEL.md)
- [Pruebas de aceptación](docs/ACCEPTANCE_TESTS.md)
- [Plan de seguridad del backend](docs/BACKEND_SECURITY_PLAN.md)
- [Matriz de autorización por endpoint](docs/SECURITY_ROUTE_MATRIX.md)
- [Documentación de la API](server/README.md)

## Demo local

Abrí `index.html` en un navegador moderno o ejecutá desde la raíz:

```bash
python -m http.server 8000
```

Luego entrá a http://localhost:8000. La demo utiliza HTML, CSS y JavaScript sin backend; persiste cambios en el `localStorage` del navegador y permite restaurar datos de prueba. Sus datos y selector de rol son exclusivamente demostrativos.

La demo contiene vistas de miembros, cuentas corrientes, obligaciones mensuales fijas de profesores, agenda, reservas, lista de espera, asistencia, ejercicios/rutinas, avisos y perfiles. Su presencia en la interfaz no implica que los flujos estén integrados con la API.

## Portal conectado a la API

`portal.html` ofrece una primera interfaz conectada al backend. La recuperación de contraseña está en `reset-password.html`; requiere configurar `RESEND_API_KEY`, `PASSWORD_RESET_FROM` y `PASSWORD_RESET_BASE_URL` en el entorno del servidor. Los enlaces llevan el token en el fragmento de URL y vencen a los 30 minutos. Usa sesiones del servidor, cookie HttpOnly y token CSRF en memoria; no comparte el almacenamiento local de la demo. Incluye vistas iniciales para miembros, servicios, membresías, cuentas corrientes, profesores e invitaciones.

Para desarrollo, seguí [server/README.md](server/README.md): requiere Node.js 22 y PostgreSQL. En terminales separadas, ejecutá la API desde `server/` y el servidor estático desde la raíz; después abrí http://localhost:8000/portal.html. En localhost el portal apunta por defecto a la API en el puerto 3001.

## Identidad visual y assets

La guía de marca está en [assets/brand/README.md](assets/brand/README.md). La paleta principal se mide a partir del logo original y se comparte entre la demo y el portal mediante [assets/brand/tokens.css](assets/brand/tokens.css). El set local de iconos SVG se encuentra en [assets/icons/ikigai-symbols.svg](assets/icons/ikigai-symbols.svg).

Se generaron iconos PWA de 192×192 y 512×512, un icono maskable, favicon, Apple Touch Icon e imagen Open Graph desde el logo original. El generador reproducible está en `scripts/generate-pwa-icons.py`; para ejecutarlo instalá `requirements-assets.txt` y corré `python scripts/generate-pwa-icons.py`. La validación dimensional está en `scripts/validate-brand-assets.py`.

**Fidelidad del logo:** la fuente disponible es un JPG con fondo negro. El negro también integra los contornos de la figura, las pesas y las letras; por eso no se lo eliminó automáticamente ni se presenta un PNG transparente falso. Una variante transparente requiere el original editable/vectorial o un recorte manual revisado.

## Backend y validaciones

La API usa TypeScript, Fastify y PostgreSQL. Incluye una primera implementación de autenticación, sesiones revocables, protección CSRF/origen, autorización por rol y alcance, reservas transaccionales, cuenta corriente, asistencia, rutinas versionadas y obligaciones mensuales de profesores.

El workflow de GitHub Actions verifica sintaxis de JavaScript, reglas de producto, el manifiesto PWA, TypeScript, tests, build y migraciones contra PostgreSQL. El backend versiona `server/package-lock.json` y CI usa `npm ci` para instalar las dependencias de forma reproducible.

La rama de Fase 3 incorpora endpoints de recuperación de contraseña con tokens de un solo uso y rate limiting compartido en PostgreSQL, además de una prueba de backup/restauración para una base local descartable. Esta rama sigue en revisión: los últimos intentos de CI no generaron pasos ni logs verificables, por lo que no se da por validada ni se integra todavía. Antes de usar datos reales faltan cerrar la matriz de autorización negativa, revisar sistemáticamente la auditoría, completar la interfaz de restablecimiento en una fase posterior, obtener CI verde, realizar una revisión de seguridad independiente y configurar backups/monitoreo/despliegue en la infraestructura elegida. Ejecutá `npm run check`, `npm test`, `npm run build` y `npm run db:migrate` desde `server/` contra una base descartable.

## Reglas del negocio que no deben alterarse accidentalmente

- La obligación de cada profesor con el gimnasio es mensual, fija e independiente de reservas o asistencia; no hay reparto porcentual.
- Los importes mensuales de profesores permanecen sin configurar hasta que se acuerden explícitamente; se admiten pagos parciales y saldos a favor.
- Los movimientos financieros mantienen historial; cambiar una tarifa no reescribe cargos o pagos anteriores.
- Las reservas respetan el corte de 40 minutos y la capacidad configurada; la lista de espera no consume cupos confirmados.
- No se incorporan multas automáticas no aprobadas.
- La autorización efectiva se valida en el servidor.
- El logo existente y la identidad visual oscura/roja son la referencia de marca. La Fase 2 debe inspeccionar y medir el original antes de crear variantes o modificar colores.
- No cargar datos reales ni tratar el prototipo como sistema de producción.
