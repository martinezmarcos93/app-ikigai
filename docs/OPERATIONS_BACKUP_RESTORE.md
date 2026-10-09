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

El script crea una base de restauración con nombre temporal en el mismo servidor que indica `DATABASE_URL), valida el esquema y los datos restaurados, y la elimina al finalizar. **No lo ejecutes contra una base con datos reales ni contra un servidor de producción.** Usa credenciales locales de prueba y verifica que `DATABASE_URL` apunte a la base descartable correcta antes de ejecutarlo.

## Controles obligatorios antes de producción

- Activar backups automáticos administrados por el proveedor y definir RPO/RTO aprobados.
- Cifrar backups en reposo y tránsito; restringir quién puede descargarlos o restaurarlos.
- Definir retención, borrado, región y tratamiento de datos personales.
- Alertar ante fallos y medir la antigüedad del último backup válido.
- Ejecutar restauraciones periódicas en un entorno aislado y verificar migraciones y relaciones sin imprimir datos personales.
- Documentar responsables, acceso de emergencia, rotación de secretos y procedimiento de recuperación.
- Mantener los backups fuera del repositorio y no publicarlos en logs ni artifacts de CI.

**Estado:** el ensayo automatizado de restauración forma parte del workflow. Los backups de producción, la retención, el cifrado, las alertas, el RPO/RTO y el calendario de restauración siguen pendientes de configurar con la infraestructura elegida.
