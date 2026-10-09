# Ikigai Training

Aplicación en desarrollo para la gestión de un gimnasio. El repositorio mantiene dos superficies diferenciadas: una demo local navegable y un portal inicial conectado a una API multiusuario.

## Estado y hoja de ruta

La hoja de ruta canónica es [docs/ROADMAP_IMPLEMENTATION.md](docs/ROADMAP_IMPLEMENTATION.md). La guía de [puesta en marcha inicial](docs/INITIAL_SETUP.md) describe cómo crear el primer administrador y configurar una instalación vacía. Define el orden de implementación, criterios de cierre, riesgos conocidos y estado de cada área. El trabajo se ejecuta por fases; no se adelantan cambios de identidad visual ni se declara terminada una función sin pruebas.

Documentación relacionada:

- [Plan de producto y reglas del negocio](docs/PRODUCT_PLAN.md)
- [Modelo de datos](docs/DATA_MODEL.md)
- [Pruebas de aceptación](docs/ACCEPTANCE_TESTS.md)
- [Plan de seguridad del backend](docs/BACKEND_SECURITY_PLAN.md)
- [Matriz de autorización por endpoint](docs/SECURITY_ROUTE_MATRIX.md)
- [Copias de seguridad y restauración](docs/OPERATIONS_BACKUP_RESTORE.md)
- [Documentación de la API](server/README.md)
- [Inventario de integración del portal y API](docs/PORTAL_API_INVENTORY.md)

## Acceso principal: portal conectado

Abrí `http://localhost:8000/` o `portal.html` para usar el portal multiusuario. La cuenta inicial de administración se crea desde el servidor; no hay registro público de administradores. Seguí [docs/INITIAL_SETUP.md](docs/INITIAL_SETUP.md). La PWA inicia en el portal conectado.

## Prototipo local aislado

El prototipo de interfaz sin autenticación se conserva en `demo.html` para referencia visual y pruebas de interacción. Está vacío por defecto y no comparte datos con el portal. Abrilo explícitamente si necesitás revisar el prototipo.

Para servir el repositorio desde la raíz:

```bash
python -m http.server 8000
```

Luego entrá a http://localhost:8000/ para abrir el portal conectado. `demo.html` utiliza HTML, CSS y JavaScript sin backend; persiste sólo datos locales del prototipo. Su selector de rol es una simulación, no una autenticación.

La demo contiene vistas de miembros, cuentas corrientes, obligaciones mensuales fijas de profesores, agenda, reservas, lista de espera, asistencia, ejercicios/rutinas, avisos y perfiles. Su presencia en la interfaz no implica que los flujos estén integrados con la API.

## Portal conectado a la API

`portal.html` es la interfaz principal conectada al backend. Usa sesiones del servidor, cookie HttpOnly y token CSRF en memoria; no comparte el almacenamiento local de la demo. La recuperación de contraseña está disponible en `reset-password.html`; el enlace lleva el token en el fragmento URL, vence a los 30 minutos y requiere configurar el adaptador HTTPS de entrega y `PASSWORD_RESET_PUBLIC_URL` en el servidor. Incluye vistas iniciales para miembros, servicios, membresías, cuentas corrientes, profesores e invitaciones.

Para desarrollo, seguí [server/README.md](server/README.md): requiere Node.js 22 y PostgreSQL. En terminales separadas, ejecutá la API desde `server/` y el servidor estático desde la raíz; después abrí http://localhost:8000/portal.html. En localhost el portal apunta por defecto a la API en el puerto 3001.

## Identidad visual y assets

La guía de marca está en [assets/brand/README.md](assets/brand/README.md). La paleta principal se mide a partir del logo original y se comparte entre la demo y el portal mediante [assets/brand/tokens.css](assets/brand/tokens.css). El set local de iconos SVG se encuentra en [assets/icons/ikigai-symbols.svg](assets/icons/ikigai-symbols.svg).

Se generaron iconos PWA de 192×192 y 512×512, un icono maskable, favicon, Apple Touch Icon e imagen Open Graph desde el logo original. El generador reproducible está en `scripts/generate-pwa-icons.py`; para ejecutarlo instalá `requirements-assets.txt` y corré `python scripts/generate-pwa-icons.py`. La validación dimensional está en `scripts/validate-brand-assets.py`.

**Fidelidad del logo:** la fuente disponible es un JPG con fondo negro. El negro también integra los contornos de la figura, las pesas y las letras; por eso no se lo eliminó automáticamente ni se presenta un PNG transparente falso. Una variante transparente requiere el original editable/vectorial o un recorte manual revisado.

## Backend y validaciones

La API usa TypeScript, Fastify y PostgreSQL. Incluye una primera implementación de autenticación, sesiones revocables, protección CSRF/origen, autorización por rol y alcance, reservas transaccionales, cuenta corriente, asistencia, rutinas versionadas y obligaciones mensuales de profesores.

El workflow de GitHub Actions verifica sintaxis de JavaScript, reglas de producto, el manifiesto PWA, TypeScript, tests, build y migraciones contra PostgreSQL. El backend versiona `server/package-lock.json` y CI usa `npm ci` para instalar las dependencias de forma reproducible.

La Fase 3 agrega una pantalla de recuperación de contraseña, entrega por adaptador HTTPS configurado, rate limiting compartido en PostgreSQL, minimización de auditoría y un ensayo automatizado de backup/restore. Antes de usar datos reales faltan validar el pipeline final, configurar y probar el adaptador real, completar la matriz de autorización de todos los endpoints, obtener una revisión independiente y definir backups cifrados/retención/restauración del proveedor de producción, monitoreo y despliegue seguro. Ejecutá `npm run check`, `npm test`, `npm run build` y `npm run db:migrate` desde `server/` contra una base descartable.

## Reglas del negocio que no deben alterarse accidentalmente

- La obligación de cada profesor con el gimnasio es mensual, fija e independiente de reservas o asistencia; no hay reparto porcentual.
- Los importes mensuales de profesores permanecen sin configurar hasta que se acuerden explícitamente; se admiten pagos parciales y saldos a favor.
- Los movimientos financieros mantienen historial; cambiar una tarifa no reescribe cargos o pagos anteriores.
- Las reservas respetan el corte de 40 minutos y la capacidad configurada; la lista de espera no consume cupos confirmados.
- No se incorporan multas automáticas no aprobadas.
- La autorización efectiva se valida en el servidor.
- El logo existente y la identidad visual oscura/roja son la referencia de marca. La Fase 2 debe inspeccionar y medir el original antes de crear variantes o modificar colores.
- No cargar datos reales ni tratar el prototipo como sistema de producción.
