# Copias de seguridad y restauración — Ikigai Training

## Alcance

Hay que distinguir dos controles:

1. **Ensayo automatizado:** el workflow ejecuta `server/scripts/backup-restore-check.sh` sobre una base PostgreSQL descartable. El script crea un dump en formato custom, restaura en otra base, comprueba un registro marcador y el historial de migraciones, y elimina la base restaurada y los archivos temporales.
2. **Operación de producción:** todavía requiere configurar el proveedor PostgreSQL y el entorno de despliegue. El ensayo de CI no demuestra que existan backups de producción.

## Ejecución local segura

Requisitos: Node.js, PostgreSQL client tools (`pg_dump`, `pg_restore`, `psql`) y una base local descartable con el esquema aplicado.

Desde `server/`:

```bash
export DATABASE_URL='postgres://usuario:clave@localhost:5432/ikigai_dev'
npm run db:migrate
bash scripts/backup-restore-check.sh
```

El script solo acepta URLs PostgreSQL cuyo host sea `localhost`, `127.0.0.1` o `[::1]`; rechaza hosts remotos antes de ejecutar herramientas de PostgreSQL. Crea una base de restauración con nombre temporal en el mismo servidor local indicado por `DATABASE_URL`, valida el esquema y los datos restaurados, y la elimina al finalizar. **No lo ejecutes contra una base con datos reales.** Usa credenciales locales de prueba y verifica que `DATABASE_URL` apunte a la base descartable correcta antes de ejecutarlo.

## Respaldo descargable por administración (cifrado)

Administración puede pedir un respaldo completo de la base con `POST /api/v1/admin/backup` (cuerpo `{"passphrase": "..."}`, mínimo 12 caracteres; requiere sesión de administración y token CSRF). La respuesta es un archivo `.ikbk`: JSON comprimido y cifrado con AES-256-GCM, con la clave derivada de la frase por scrypt (N=2^16). **La frase la elige quien descarga y no se guarda en ningún lado: sin ella el archivo no se puede abrir.** Se anota en la auditoría quién lo pidió y los totales por tabla (nunca la frase ni los datos). Límite: 3 pedidos cada 10 minutos.

- **Incluye** todas las tablas de negocio (personas, cuentas, membresías, movimientos, agenda, reservas, asistencia, rutinas, avisos, auditoría y configuración), incluidos los hashes de contraseña, por eso va cifrado.
- **Excluye** sesiones, claves de recuperación, invitaciones pendientes y contadores de intentos (secretos efímeros). Quienes tengan una invitación pendiente deberán recibir una nueva tras restaurar.
- Es una foto consistente (transacción de lectura repetible), sin parar el servicio.

Verificar y restaurar (desde `server/`; la frase se pasa por variable de entorno, no por argumento):

```bash
IKIGAI_BACKUP_PASSPHRASE='...' npx tsx scripts/restore-backup.ts ikigai-respaldo-AAAAMMDD-HHMM.ikbk              # solo verifica y muestra totales
IKIGAI_BACKUP_PASSPHRASE='...' DATABASE_URL=... npx tsx scripts/restore-backup.ts archivo.ikbk --restaurar       # carga en una base NUEVA
```

Restaurar exige una base recién migrada (`npm run db:migrate`) y vacía; si alguna tabla tiene datos, se cancela sin tocar nada. La carga es una sola transacción y compara los totales antes de confirmar. Ensayo hecho el 12/10/2026: respaldo de una base de prueba con 25 tablas restaurado en otra base nueva con contenido idéntico.

Guardá el archivo y la frase por separado y en lugares distintos (por ejemplo el archivo en un disco externo y la frase en un gestor de contraseñas). Un respaldo que nunca se probó restaurar no cuenta: repetir el ensayo con un archivo real después de cada cambio de esquema.

## Controles obligatorios antes de producción

- Activar backups automáticos administrados por el proveedor y definir RPO/RTO aprobados.
- Cifrar backups en reposo y tránsito; restringir quién puede descargarlos o restaurarlos.
- Definir retención, borrado, región y tratamiento de datos personales.
- Alertar ante fallos y medir la antigüedad del último backup válido.
- Ejecutar restauraciones periódicas en un entorno aislado y verificar migraciones y relaciones sin imprimir datos personales.
- Documentar responsables, acceso de emergencia, rotación de secretos y procedimiento de recuperación.
- Mantener los backups fuera del repositorio y no publicarlos en logs ni artifacts de CI.

**Estado:** el ensayo automatizado de restauración forma parte del workflow. Los backups de producción, la retención, el cifrado, las alertas, el RPO/RTO y el calendario de restauración siguen pendientes de configurar con la infraestructura elegida.
