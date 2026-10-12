# ADR-001 · Dónde viven los datos de Ikigai y cómo se asocia el dominio

**Estado:** propuesta (12/10/2026). Decide Marcos.
**Contexto:** hoy la app corre en la PC de Marcos con un túnel gratuito de Cloudflare (demo, datos ficticios). Se va a comprar un dominio
`.com.ar` en NIC Argentina. Falta decidir dónde se guarda la base de datos real, sin pagar un servidor mensual.

## 1. Qué hizo el proyecto del veterinario (app-vet) y por qué funcionó

| Aspecto | app-vet (Lautaro Tonus) |
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

## 5. Asociar el dominio (NIC → Cloudflare, gratis)

1. Registrar `ikigai….com.ar` en nic.ar (≈ $8.500/año). **El titular debe ser el gimnasio o su dueño**; si lo registra Marcos con su CUIT/CUIL,
   queda a su nombre y conviene dejar por escrito que se transferirá la titularidad (NIC permite transferirla).
2. Crear la cuenta de Cloudflare (ya existe) → *Add a domain* → plan Free → anotar los dos *nameservers*.
3. En NIC: *Delegar* el dominio a esos *nameservers* (tarda de minutos a unas horas).
4. En Cloudflare: la **landing** en Pages → *Custom domains* (`ikigai….com.ar` y `www`); la **app** en `app.ikigai….com.ar` mediante un
   *túnel con nombre* hacia el equipo (opción A) o un registro hacia el servidor (opciones B/C).
5. Recompilar la APK con `bash apk/build-apk.sh app.ikigai….com.ar 1.0.0 <versionCode mayor>` (misma clave de firma: se instala encima de la demo).
