# Despliegue y operación — Ikigai Training

Runbook para instalar, actualizar, respaldar y operar Ikigai en **un único servidor con Docker**. Esta es la
decisión de despliegue de la hoja de ruta (Fase 7): una máquina, un dominio, contenedores. No hay
dependencias de un proveedor concreto: sirve cualquier VPS o servidor propio con Docker Engine 24+ y el plugin
Compose. **Nada de esto se ejecutó nunca contra datos reales**; ver «Antes de cargar datos reales».

## Qué se despliega

| Servicio | Imagen | Rol | Expuesto |
| --- | --- | --- | --- |
| `web` | `deploy/web.Dockerfile` (Caddy) | HTTPS automático, portal estático (lista blanca de archivos), proxy de `/api` | 80 y 443 |
| `api` | `server/Dockerfile` (Node 22) | API, usuario `node`, sistema de archivos de solo lectura, sin capacidades | no |
| `migrate` | la misma imagen | aplica migraciones y termina | no |
| `db` | `postgres:16` | datos, volumen `dbdata` | no |

Portal y API comparten **origen**: el navegador habla con `/api/v1` sin CORS y la cookie de sesión
(`HttpOnly; Secure; SameSite=Strict`) nunca sale de ese origen. El proxy aplica una CSP sin scripts en línea ni
recursos de terceros (las tipografías van empaquetadas), `nosniff`, `Referrer-Policy: no-referrer`, HSTS y
`frame-ancestors 'none'`. Sólo se sirven los archivos públicos: `docs/`, `server/`, `scripts/` y `.env` dan 404.

## Instalación

1. **Servidor:** Docker + Compose; DNS del dominio apuntando al servidor; puertos 80 y 443 abiertos (y nada más
   hacia afuera: la base y el API no publican puertos).
2. **Configuración:**
   ```bash
   cp deploy/.env.example deploy/.env
   chmod 600 deploy/.env
   # Completar: POSTGRES_PASSWORD y SESSION_SECRET (openssl rand -hex 24 / -hex 32), PUBLIC_ORIGIN,
   # SITE_ADDRESS (el dominio), PASSWORD_RESET_DELIVERY_URL/TOKEN/PUBLIC_URL. `deploy/.env` no se versiona.
   ```
   En producción el API se niega a arrancar sin `CORS_ORIGINS`, un `SESSION_SECRET` de 32+ caracteres y el
   adaptador HTTPS de recuperación de contraseña: es deliberado.
3. **Levantar:**
   ```bash
   docker compose -f deploy/compose.yaml --env-file deploy/.env up -d --build
   docker compose -f deploy/compose.yaml --env-file deploy/.env ps      # api y db deben estar healthy
   ```
   Las migraciones corren solas antes de iniciar el API (`migrate` termina y `api` espera su éxito).
4. **Primer administrador** (no hay registro público de administradores):
   ```bash
   docker compose -f deploy/compose.yaml --env-file deploy/.env run --rm \
     -e ADMIN_EMAIL=admin@ejemplo.com -e ADMIN_PASSWORD='una-clave-larga-de-12-a-128' \
     -e ADMIN_MUST_CHANGE_PASSWORD=1 \
     api node dist/scripts/create-admin.js
   ```
   Con `ADMIN_MUST_CHANGE_PASSWORD=1` la clave entregada es temporal: al entrar por primera vez el portal le pide a
   quien administra que elija una propia, y a continuación arranca la guía de primer uso.
   Después seguir [`INITIAL_SETUP.md`](INITIAL_SETUP.md): servicios → profesores → miembros → **Horarios** →
   **Generar clases** → crear los accesos desde «Accesos» (usuario y clave temporal que se entregan en persona o
   por un canal seguro).
5. **Verificar:** `curl -I https://TU-DOMINIO/portal.html` (cabeceras de seguridad), `curl https://TU-DOMINIO/healthz`
   (`{"status":"ok"}`), iniciar sesión en el portal.

Para una prueba local sin dominio: `SITE_ADDRESS=localhost`, `PUBLIC_ORIGIN=https://localhost:8443`,
`PASSWORD_RESET_PUBLIC_URL=https://localhost:8443/reset-password.html`, `HTTPS_PORT=8443` y aceptar el certificado
interno de Caddy. Con ese entorno se corrieron `scripts/e2e-roles.py` y `scripts/audit-mobile.py` (con
`E2E_BASE=https://localhost:8443 E2E_IGNORE_HTTPS_ERRORS=1 E2E_PG_CONTAINER=ikigai-db-1 E2E_PG_DB=ikigai`).

## Respaldos y restauración

- **Respaldo:** `deploy/backup.sh` genera un volcado `pg_dump -Fc` en `./backups` (modo 700) y borra los de más de
  `RETENTION_DAYS` (14 por defecto). Con `AGE_RECIPIENT=age1…` lo cifra con [age](https://age-encryption.org).
  Programarlo a diario: `15 3 * * * cd /ruta/al/repo && deploy/backup.sh >> /var/log/ikigai-backup.log 2>&1`.
- **Copia fuera del servidor:** el script **no** la hace. Copiar `./backups` a otro disco o proveedor (rclone,
  rsync, un bucket) con un cron propio; un respaldo que vive en la misma máquina no sobrevive a la máquina.
- **Ensayo de restauración:** `deploy/restore-check.sh` restaura el respaldo más reciente en una base temporal,
  comprueba migraciones, tablas, usuarios y auditoría, y la borra. No toca la base real. Correrlo al menos una vez
  por semana y siempre después de cambiar de versión. Resultado de referencia (entorno de prueba con datos de
  ejemplo): `6 migraciones, 27 tablas, 3 usuarios, 12 eventos de auditoría`.
- **Restauración real** (pérdida de datos): parar el API (`docker compose … stop api web`), crear una base nueva
  desde el último respaldo bueno (`pg_restore` con `--clean --if-exists` sobre `ikigai`, o crear `ikigai_nueva`,
  restaurar, verificar y renombrar), levantar de nuevo y probar el inicio de sesión. Anotar la hora del respaldo
  usado: lo posterior se perdió.
- **Objetivos a fijar con quien opere el gimnasio:** RPO (cuánto dato se tolera perder; con respaldo diario son
  hasta 24 h) y RTO (cuánto se tolera estar caído). Si 24 h es demasiado, subir la frecuencia del cron.

## Actualizar y volver atrás

```bash
git pull                                             # o desplegar el tag acordado
deploy/backup.sh                                     # SIEMPRE antes de actualizar
docker compose -f deploy/compose.yaml --env-file deploy/.env up -d --build
docker compose -f deploy/compose.yaml --env-file deploy/.env ps
deploy/restore-check.sh                              # el respaldo previo sigue siendo restaurable
```

- Las migraciones son **sólo hacia adelante**: no hay migraciones inversas. Por eso el respaldo previo a cada
  actualización es la red de seguridad real.
- **Rollback de código sin cambio de esquema:** `git checkout <tag-anterior>` y repetir `up -d --build`.
- **Rollback con una migración nueva ya aplicada:** volver al código anterior puede fallar si usa tablas
  cambiadas. Parar, restaurar el respaldo previo a la actualización (se pierden los datos posteriores a él) y
  levantar el código anterior. Una migración que sólo agrega columnas o índices (como `0006`) es compatible hacia
  atrás con el código previo.
- La caché del service worker se versiona (`ikigai-shell-vN`): tras actualizar, los clientes toman la versión nueva
  al volver a abrir la PWA.

## Secretos y rotación

| Secreto | Dónde | Qué pasa al rotarlo |
| --- | --- | --- |
| `SESSION_SECRET` | `deploy/.env` | Invalida los tokens CSRF que las pestañas abiertas tienen en memoria (las escrituras dan `403` hasta recargar la página, que obtiene uno nuevo con `/auth/me`) y reinicia los límites de intentos, porque su clave se deriva con HMAC. Las sesiones persistidas siguen siendo válidas: no hay que volver a iniciar sesión. |
| `POSTGRES_PASSWORD` | `deploy/.env` **y** `ALTER USER ikigai PASSWORD '…'` dentro de la base | Cambiar sólo el archivo deja al API sin acceso: primero el `ALTER USER`, luego el archivo y `up -d`. |
| `PASSWORD_RESET_DELIVERY_TOKEN` | `deploy/.env` y el adaptador de correo | Rotarlo en ambos lados a la vez. |

Rotar de inmediato ante cualquier sospecha de filtración y siempre al dejar de colaborar con alguien que los vio.
Nunca guardar secretos en el repositorio, en capturas ni en mensajes.

## Contraseñas y memoria

Las contraseñas se guardan con scrypt (N=2¹⁶, r=8, p=2, unos 64 MiB y ~0,3 s por verificación; recomendación de OWASP). El
costo viaja dentro de cada hash: las contraseñas guardadas con un costo menor (el anterior era N=2¹⁴) siguen valiendo y se
vuelven a guardar con el costo actual la próxima vez que la persona inicia sesión. Para subir el costo en el futuro basta
cambiar `CURRENT_PARAMETERS` en `server/src/security/password.ts`. Como Node puede verificar cuatro contraseñas a la vez, el
servicio `api` tiene `mem_limit: 1g`: no bajarlo sin revisar este punto.

## Observabilidad

- **Salud:** `GET /healthz` (también a través del proxy) y el `HEALTHCHECK` de las imágenes; `docker compose ps`
  muestra `healthy`.
- **Logs:** el API escribe JSON estructurado (una línea por evento, con `reqId`) a la salida estándar:
  `docker compose … logs -f api`. No contienen contraseñas, tokens ni cuerpos de petición. Rotarlos con el driver
  de logs de Docker (`json-file` con `max-size`/`max-file`) y reenviarlos a un colector si hace falta.
- **Auditoría de negocio:** la tabla `audit_events` (append-only) registra altas, cambios de acceso, cancelaciones,
  generación de clases, etc. con el actor y el `request_id`: sirve para reconstruir qué pasó.
- Pendiente de decidir con datos reales: métricas y alertas (por ejemplo, tasa de errores 5xx, latencia p95 y
  espacio en disco con un aviso al 80 %).

## Respuesta a incidentes

1. **Contener:** si hay sospecha de acceso indebido, `docker compose … stop web` corta la entrada mientras se
   investiga; la base queda intacta.
2. **Preservar evidencia:** `docker compose … logs --no-color > incidente-FECHA.log` y un respaldo (`deploy/backup.sh`)
   **antes** de tocar nada.
3. **Revocar accesos:** desde «Accesos» o la API, `POST /api/v1/admin/users/:id/sessions/revoke` cierra todas las
   sesiones de una cuenta; `reset-access` obliga a elegir una contraseña nueva (no aplica a administradores:
   para una cuenta admin comprometida, cambiar la contraseña directamente y rotar `SESSION_SECRET`).
4. **Rotar secretos** según la tabla de arriba.
5. **Reconstruir:** con `audit_events` y los logs determinar alcance (qué cuentas, qué datos, desde cuándo).
6. **Avisar:** si hubo datos personales de miembros expuestos, informar a las personas afectadas y a la
   autoridad que corresponda en el país (en Argentina, la AAIP, conforme a la Ley 25.326).
7. **Cerrar:** restaurar el servicio, escribir qué pasó y qué se cambió, y agregar la prueba o el control que lo
   habría evitado.

## Antes de cargar datos reales

El roadmap lo exige y este documento no lo reemplaza. Falta, como mínimo:

- [ ] **Revisión independiente de seguridad** y resolución de sus hallazgos (no la hace quien escribió el código).
- [ ] **Servidor real elegido y contratado**, dominio y DNS, y un ensayo de instalación completo en él.
- [ ] **Adaptador de correo** de recuperación de contraseña en producción (el API no envía correos por sí mismo).
- [ ] **Copia de respaldo fuera del servidor** y un ensayo de restauración sobre esa copia.
- [ ] **Validación en dispositivos Android reales** (gama baja y media/alta).
- [ ] **CI ejecutándose:** hoy GitHub Actions no corre en este repositorio privado por facturación; hasta resolverlo la
      validación es la local descripta en `ROADMAP_IMPLEMENTATION.md`.
- [ ] **Política de datos:** consentimiento, exportación y borrado de datos de miembros, y quién responde ante un
      pedido.
