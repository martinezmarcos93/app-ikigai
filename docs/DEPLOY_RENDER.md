# Servidor en Render (plan gratuito) + Neon

Dirección elegida en `docs/decisions/ADR-001-donde-viven-los-datos.md` §6: la API corre en Render y la base en Neon, las dos en
la **misma región** (Oregón) para que cada consulta a la base no pague un viaje largo. Los secretos se cargan **solo** en el panel de
Render: no van al repositorio ni a ningún chat.

## 1. Base de datos (Neon)
- Proyecto `ikigai`, región **AWS US West 2 (Oregon)**, Postgres 16.
- Botón *Connect* → **desactivar «Connection pooling»** → copiar la dirección. Hay que usar la conexión directa: el migrador usa
  un bloqueo (`pg_advisory_lock`) y las transacciones de lectura repetible del respaldo, que no funcionan a través del pooler.

## 2. Servicio web (Render)
*New → Web Service* → repositorio `martinezmarcos93/app-ikigai` (rama `main`).

| Campo | Valor |
| --- | --- |
| Region | Oregon (la única que el plan gratis ofreció) |
| Root Directory | `server` |
| Runtime | Docker |
| Instance Type | Free |
| Docker Command | `npm run start:render` |
| Health Check Path | `/healthz` |

`npm run start:render` aplica las migraciones pendientes y después arranca la API (`node dist/scripts/migrate.js && node dist/src/index.js`).
No usar `sh -c "…"` en el campo: Render no interpreta las comillas y el servicio sale con estado 127.

### Variables de entorno
| Nombre | Valor |
| --- | --- |
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` |
| `DATABASE_URL` | la dirección **directa** de Neon (secreto) |
| `SESSION_SECRET` | `openssl rand -hex 32` (secreto) |
| `CORS_ORIGINS` | `https://app.ikigai-training.com` |
| `TRUST_PROXY_HOPS` | `2` (a confirmar cuando el Worker esté delante) |
| `GYM_TIMEZONE` | `America/Argentina/Buenos_Aires` |
| `PASSWORD_RESET_DELIVERY_URL` | `https://recuperacion-no-configurada.invalid/ikigai` |
| `PASSWORD_RESET_DELIVERY_TOKEN` | `openssl rand -hex 32` (secreto) |
| `PASSWORD_RESET_PUBLIC_URL` | `https://app.ikigai-training.com/reset-password.html` |

En producción el servidor se niega a arrancar sin las tres variables `PASSWORD_RESET_*` (si falta alguna sale con error de configuración).
La recuperación por correo no está configurada: las claves se entregan por administración (usuario y clave temporal). El valor `.invalid`
es el mismo que usa la demo (`deploy/demo-gratis.sh`) y hace que un pedido de recuperación falle sin enviar nada.

`PORT` lo define Render solo (no configurarlo).

## 3. Primer administrador
Render gratis no da consola. Se crea desde una terminal propia contra Neon, sin dejar la dirección en el historial:
`cd server && read -rs DATABASE_URL && export DATABASE_URL && npm run admin:create` (pegar la dirección directa, Enter).

## 4. Límites del plan gratis
- Duerme tras 15 minutos sin tráfico y tarda ~1 minuto en despertar; 750 horas por mes compartidas entre todos los servicios del workspace.
- Neon gratis: 1 GB, restauración de 6 horas: el respaldo cifrado de administración (`docs/OPERATIONS_BACKUP_RESTORE.md`) es la protección real.
