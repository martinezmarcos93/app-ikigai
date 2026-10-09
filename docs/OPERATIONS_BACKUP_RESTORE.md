# Copias de seguridad y restauración — Ikigai Training

## Alcance

Este procedimiento separa dos controles que no deben confundirse:

1. **Prueba reproducible en CI:** genera un dump PostgreSQL en formato custom, restaura en una base temporal local y comprueba que existen las tablas principales y el historial de migraciones. La base temporal y el archivo se eliminan al terminar.
2. **Operación de producción:** todavía depende del proveedor PostgreSQL y del entorno de despliegue elegidos. No se afirma que existan backups de producción hasta configurar retención, cifrado, alertas y permisos en ese proveedor.

## Prueba local segura

Requisitos: Node.js, PostgreSQL client tools (pg_dump, pg_restore, psql, dropdb) y dos URLs a bases PostgreSQL **locales**. La base de origen debe ser descartable; la URL de mantenimiento suele apuntar a la base postgres.

Desde server/:

    export DATABASE_URL='postgres://ikigai:password@localhost:5432/ikigai_dev'
    export RESTORE_DATABASE_URL='postgres://ikigai:password@localhost:5432/postgres'
    npm run db:migrate
    bash scripts/backup-restore-smoke.sh

El script rechaza hosts no locales, exige que la base de mantenimiento sea distinta de la fuente, crea un nombre temporal, ejecuta dump/restauración y elimina el archivo y la base de prueba al finalizar. No utilizar túneles que hagan pasar una base remota por localhost ni datos reales para esta prueba.

## Controles obligatorios antes de producción

- Activar backups automáticos del proveedor y definir RPO/RTO aprobados.
- Cifrar backups en reposo y tránsito; limitar quién puede restaurarlos o descargarlos.
- Definir retención, borrado, región y tratamiento de datos personales.
- Alertar ante fallo de backup y medir antigüedad del último backup válido.
- Ejecutar restauración periódica en un entorno aislado; comprobar migraciones, relaciones y conteos de control sin imprimir datos personales.
- Documentar responsables, credenciales de emergencia, rotación de secretos y procedimiento de recuperación.
- Mantener backups fuera del repositorio y no adjuntarlos a logs de CI ni artifacts públicos.

**Estado:** la prueba automatizada en base descartable forma parte del CI; los backups de producción y el calendario de restauración quedan pendientes de elegir y configurar la infraestructura.
