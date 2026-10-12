# ADR-001 · Dónde viven los datos de Ikigai y cómo se asocia el dominio

**Estado:** dirección aceptada por Marcos el 12/10/2026 (sección 6); pendientes de verificar en la sección 6.3. Reemplaza a la recomendación de la sección 4.
**Contexto:** hoy la app corre en la PC de Marcos con un túnel gratuito de Cloudflare (demo, datos ficticios). Se va a comprar un dominio
`.com.ar` en NIC Argentina (**actualización 12/10/2026: finalmente se compró `ikigai-training.com` en DonWeb**, ver §5). Falta decidir dónde se guarda la base de datos real, sin pagar un servidor mensual.

## 1. Qué hizo el proyecto del veterinario (app-vet) y por qué funcionó

| Aspecto | app-vet (clínica veterinaria) |
| --- | --- |
| Arquitectura | **Sin servidor propio**: React PWA que habla directo con Firebase (Auth + Firestore) con **reglas de seguridad** en la base. |
| Dónde viven los datos | **Firestore, en la nube de Google**, plan Spark (gratis). El teléfono solo guarda un caché para trabajar sin señal. |
| Hosting | Firebase Hosting (gratis) en `tonusvet-registros-4e97c.web.app`, **sin dominio propio** y con HTTPS incluido. |
| Despliegue | `git push` a `main` → GitHub Actions → reglas e índices primero, hosting después (hasta el 28/09; hoy Actions está bloqueado por facturación: queda el `firebase deploy` manual). |
| Respaldos | `npm run backup` (JSON) y una **tarjeta semanal en la app** que descarga el respaldo; copia a Drive **fuera de Google**. Los respaldos programados de Firestore requieren plan Blaze. |
| Costo | $0. |
| Límite que apareció | **Storage (fotos) exige plan Blaze (tarjeta)**; Marcos prefirió no cargarla. Las fotos solo viven en el iPhone: «el pendiente más caro». |
| Alcance | Un solo usuario, un solo dispositivo. Sin roles, sin libro de cuentas con transacciones. |

**Lección:** el modelo «datos en la nube del proveedor + hosting gratis + respaldo propio» sale muy bien cuando la app no tiene servidor propio
y el uso es chico. **El límite aparece cuando hace falta algo que el plan gratuito no incluye** (ahí fue Storage).

## 2. Por qué no se puede copiar tal cual en Ikigai

Ikigai **no es una app sin servidor**: tiene su propia API (Fastify) y una base **PostgreSQL** con cosas que Firestore no da:
cuenta corriente inmutable con triggers, reservas con transacciones y bloqueo de filas (cupos y lista de espera concurrentes),
idempotencia de pagos, límites de intentos compartidos, auditoría, tres roles con alcance por persona, anonimización transaccional.
Pasarlo a Firebase es **reescribir el backend** (y volver a auditarlo): no se recomienda. Firebase Hosting sí sirve para la landing, pero
la landing ya está en Cloudflare Pages gratis.

Además: para correr una API propia en Google (Cloud Run) o casi cualquier nube hace falta **tarjeta** (aunque se use dentro de la cuota gratis),
exactamente la barrera que ya apareció con Blaze.

## 3. Opciones para la base de datos real

| | A. En el gimnasio (mini PC o PC vieja) | B. Nube gratis sin tarjeta (Neon + Render/similar) | C. VPS (referencia) | D. Oracle «Always Free» |
| --- | --- | --- | --- | --- |
| Costo mensual | **$0** (más luz); una vez, hardware si no hay uno | $0 | ≈ $24.000–29.000 | $0 |
| Tarjeta | No | No | Sí | **Sí** (verificación) |
| Código | **Sin cambios** (el mismo Docker Compose) | Cambios: separar base y API, servir el portal desde la API | Sin cambios | Sin cambios |
| Datos en Argentina | **Sí** | No (EE. UU. o Brasil) | No | No |
| Disponibilidad | Depende de la luz e internet del gimnasio | Se «duerme» sin uso: la primera carga tarda ~50 s; límites que el proveedor cambia | Alta | Media (reclaman instancias ociosas) |
| Respaldos | Los armamos nosotros (a Drive y a un disco) | La base los trae limitados (ventana corta) | Los armamos | Los armamos |
| Mantenimiento | Lo hace Marcos (actualizar, vigilar) | Poco | Lo hace Marcos | Lo hace Marcos |

**Ley 25.326 (protección de datos):** enviar datos personales a servidores en países sin nivel de protección adecuado (art. 12) exige
consentimiento o cláusulas contractuales. Es una razón fuerte para preferir la opción A, o para que la abogada la revise antes de elegir B.

## 4. Recomendación

1. **Piloto (1–2 semanas, pocas personas, datos mínimos): seguir como está** (PC de Marcos + túnel). Sin costo.
2. **Producción: opción A**, un equipo dedicado en el gimnasio (mini PC o PC vieja, Linux, siempre encendido, con UPS barato), con
   **túnel con nombre de Cloudflare** sobre el dominio propio (gratis). Coincide con la filosofía local-first y evita pagar un servidor.
   Requisitos que se arman antes de cargar datos reales: arranque automático (systemd), **respaldo cifrado diario** a Drive y a un disco
   externo, prueba de restauración y alguien que mire el estado.
3. Si no hay equipo disponible: B como puente, sabiendo que es más frágil, o pagar el VPS (C).

## 5. Asociar el dominio (registrador → Cloudflare, gratis)

Estado (12/10/2026): `ikigai-training.com` registrado por Agustin en DonWeb (vence el 12/10/2027, registro no privado). Nameservers ya cambiados a
`brian.ns.cloudflare.com` y `jule.ns.cloudflare.com` (verificado por `dig`); Cloudflare lo está verificando. Pasos originales, para otros dominios:

1. Registrar el dominio. **El titular debe ser el gimnasio o su dueño**; si lo registra Marcos con su CUIT/CUIL, queda a su nombre y conviene dejar por escrito que se transferirá la titularidad.
2. Crear la cuenta de Cloudflare (ya existe) → *Add a domain* → plan Free → anotar los dos *nameservers*.
3. En el registrador: reemplazar los nameservers por esos dos (tarda de 1 a 24 horas; en NIC se llama *Delegar*).
4. En Cloudflare: la **landing** en Pages → *Custom domains* (`ikigai-training.com` y `www`); la **app** en `app.ikigai-training.com` mediante un
   *túnel con nombre* hacia el equipo (opción A) o un registro hacia el servidor (opciones B/C).
5. Recompilar la APK con `bash apk/build-apk.sh app.ikigai-training.com 1.0.0 <versionCode mayor>` (misma clave de firma: se instala encima de la demo).

## 6. Decisión del 12/10/2026 (Marcos)

Requisito explícito: que el sistema **no dependa de ninguna computadora** (ni la de Marcos ni la del gimnasio) y que **cueste $0 sin tarjeta**.
La opción A (equipo en el gimnasio) queda como plan B si la abogada exige datos en Argentina.

### 6.1 Verificado en las páginas oficiales (12/10/2026)

| Opción | Gratis y sin tarjeta | Obstáculo |
| --- | --- | --- |
| Workers + D1 | Parcial | El plan Free da **10 ms de CPU por pedido**; el scrypt con el costo OWASP que usa Ikigai no entra. Plan pago de Workers ≈ USD 5/mes (precio no verificado hoy) |
| Firebase (Spark) | Sí, pero sin Functions ni Storage | Exige reescribir el backend a reglas de Firestore y se pierde el libro de cuentas inmutable y las reservas con bloqueo de filas |
| Neon (base) + Render (API) | Sí | Render duerme el servicio a los 15 min sin tráfico y tarda ≈ 1 min en volver; la base gratuita de Render vence a los 30 días, por eso la base va en Neon (1 GB, restauración de 6 h, suspende a los 5 min) |

### 6.2 Dirección elegida

1. **Lo compartido** (reservas, cupos, cuenta corriente, asistencia) vive en un servidor: Neon + Render, con el mismo código.
2. **Cada teléfono** guarda una copia local de lo que ve (modo sin conexión). No es la fuente de verdad: dos teléfonos que reservan el último cupo exigen un lugar común.
3. **Respaldo cifrado descargable solo por administración** (`POST /api/v1/admin/backup`, `scripts/restore-backup.ts`; ver `docs/OPERATIONS_BACKUP_RESTORE.md`). Es lo que evita quedar atrapados en un proveedor.
4. Plan B: opción A, o un VPS si el arranque de ≈ 1 minuto resulta inaceptable en el gimnasio.

### 6.3 Pendientes antes de ejecutar

- Regiones disponibles en los planes gratuitos de Neon y Render (afecta Ley 25.326, art. 12) — no verificadas.
- Medir cuánto tarda el scrypt en el CPU compartido de Render gratis.
- Medir el arranque en frío real y decidir si hace falta un chequeo periódico que lo mantenga despierto (sin romper los límites de horas del plan).
- Revisión de la abogada sobre la transferencia internacional.
- ~~Confirmar el dominio con el dueño~~ Resuelto: es `ikigai-training.com` (DonWeb).
