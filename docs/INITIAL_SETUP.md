# Puesta en marcha inicial de Ikigai Training

**Objetivo:** dejar una instalación nueva vacía y configurar el primer acceso de Agustín como administrador, sin heredar perfiles, turnos, precios, saldos ni avisos de la demo.

**Estado:** preparación inicial en curso. Esta guía no constituye autorización para cargar datos reales: primero deben aprobarse las puertas de seguridad, CI, backup/restore y revisión independiente registradas en la hoja de ruta.

## 1. Qué queda vacío

La aplicación conectada lee sus datos de PostgreSQL. Una base recién migrada no debe tener miembros, profesores, servicios, membresías, movimientos, turnos, reservas, rutinas ni avisos de ejemplo.

El prototipo anterior se conserva en `demo.html`, aislado del acceso principal. Se retiraron sus datos semilla y el almacenamiento de la versión anterior se invalida al abrirlo. El prototipo local no autentica usuarios y nunca debe utilizarse como registro operativo.

## 2. Preparar el entorno

1. Usar una base PostgreSQL **dedicada y descartable** para desarrollo/aceptación. No apuntar los comandos de esta guía a una base de producción.
2. Instalar Node.js 22 o superior.
3. Desde `server/`, instalar dependencias con `npm ci`.
4. Crear el archivo local de entorno desde `.env.example` y configurar `DATABASE_URL`, `SESSION_SECRET` de al menos 32 caracteres, `CORS_ORIGINS` exacto y las variables necesarias para recuperación de contraseña. No guardar secretos reales en Git.
5. Ejecutar `npm run check`, `npm test` y `npm run build`.
6. Aplicar migraciones con `npm run db:migrate` sólo después de comprobar la base de destino.

## 3. Crear el primer administrador

El primer administrador se crea mediante el comando operativo del servidor; **no hay registro público de administradores**.

En `server/`, establecer temporalmente:

- `ADMIN_EMAIL`: el correo real que Agustín utilizará para iniciar sesión.
- `ADMIN_PASSWORD`: una contraseña inicial fuerte de 12 a 128 caracteres.
- `ADMIN_MUST_CHANGE_PASSWORD=1` (recomendado): la clave es temporal y Agustín debe cambiarla en su primer ingreso.

Luego ejecutar:

```bash
npm run admin:create
```

El comando crea el usuario y el rol `admin` en una transacción, guarda un hash de contraseña y se niega a sobrescribir un correo existente. No imprime la contraseña. No usar el correo de ejemplo que aparecía en el prototipo ni poner la contraseña en el repositorio, en tickets o en capturas. Retirar las variables temporales del entorno al terminar y entregar las credenciales por un canal seguro.

## 4. Abrir la aplicación conectada

En terminales separadas:

```bash
# Terminal 1
cd server
npm run dev
```

```bash
# Terminal 2, desde la raíz del repositorio
python -m http.server 8000
```

Abrir `http://localhost:8000/`; la entrada principal dirige al portal conectado. En desarrollo local, el cliente apunta a la API de localhost en el puerto 3001. Iniciar sesión con la cuenta administradora creada en el paso anterior.

## 5. Configurar el gimnasio en este orden

1. **Configuración institucional:** completar nombre, contacto, dirección y horarios confirmados desde la sección *Configuración*. Los campos vacíos significan que el dato sigue pendiente; la API guarda los cambios en PostgreSQL y registra la modificación en auditoría.
2. **Servicios:** registrar cada disciplina/servicio y sólo los precios que Agustín haya confirmado. El precio vigente no reescribe acuerdos históricos.
3. **Profesores:** crear perfiles de profesores con sus datos correctos. Si Agustín debe operar como administrador y profesor, el email del perfil de profesor debe coincidir con el email de su cuenta administradora; luego, desde **Accesos**, usar “Vincular profesor a una cuenta existente”. Ese flujo agrega el rol `coach` a la cuenta activa sin crear otro usuario ni quitar `admin`. Configurar la obligación mensual fija sólo cuando se haya acordado el importe y el período; no se calcula como porcentaje de reservas ni asistencia.
4. **Miembros:** dar de alta los perfiles necesarios con información verificada. El alta de un perfil no genera cargos ni credenciales.
5. **Accesos:** sólo administración crea usuarios. Junto a cada profesor o miembro, «Crear acceso» genera el usuario (`ikigai-miembro-ana`, `ikigai-profesor-lucia`; si el nombre ya existe se agrega el apellido o un número) y una clave temporal aleatoria con formato (`AM-Ikigai-K7Q4-9XMP`: iniciales y 8 caracteres al azar). La clave se muestra **una sola vez**, con un botón que copia el mensaje listo para enviar; la persona debe cambiarla al entrar por primera vez y, hasta entonces, el servidor no le permite usar nada más. Si la olvida, «Restablecer clave» genera otra y cierra sus sesiones. El sistema no envía correos: la entrega es en persona o por mensaje directo.
6. **Membresías y cuenta corriente:** asignar la membresía acordada y registrar movimientos explícitos. No se crean cargos automáticamente y los comprobantes de la aplicación no son facturas fiscales.
7. **Agenda, reservas, asistencia y rutinas:** habilitar estos flujos sólo después de comprobar su interfaz, permisos y pruebas de aceptación. La presencia de una pantalla en el prototipo no acredita integración operativa.

La lista de primera puesta en marcha del portal orienta sobre servicios, profesores y miembros que aún faltan. No reemplaza la revisión humana de los datos.

**Límite actual:** el vínculo admin+profesor tiene implementación inicial y requiere CI y prueba manual antes de confiar en él. El flujo sólo agrega el rol `coach` a una cuenta `admin` activa con correo coincidente; no ofrece todavía una interfaz general para editar cualquier combinación de roles.

## 6. Roles y límites actuales

- **Administración:** alta y gestión operativa, servicios, cuentas, profesores y accesos, según los permisos de servidor.
- **Profesor:** acceso restringido a su alcance; no debe ver cuentas corrientes ajenas.
- **Miembro:** acceso a su propio perfil, membresías, cuenta, asistencia y rutinas habilitadas.
- Ocultar una opción en el navegador no concede ni revoca permisos. La API debe seguir validando cada operación.

**Decisión pendiente:** el flujo de invitación actual crea un acceso de profesor o miembro vinculado a un perfil existente, pero no ofrece una interfaz para agregar el rol de profesor a una cuenta administradora ya creada. Antes de dar a Agustín ambos roles en un mismo inicio de sesión, hay que diseñar y probar una asignación de roles adicional; no crear una segunda cuenta con el mismo correo ni manipular la base manualmente.

## 7. Puertas antes de datos reales

No cargar información personal, deuda real ni movimientos reales hasta que:

- GitHub Actions ejecute todos los pasos y esté verde en los commits de entrega.
- Pasen las pruebas de autorización negativas entre miembros, profesores y administración.
- Se valide recuperación de contraseña y entrega segura de invitaciones.
- Se ejecute y verifique backup/restore sobre una base descartable y se defina la política del proveedor.
- Claude Code o una revisión independiente complete el análisis de seguridad y se resuelvan los hallazgos críticos.
- Se complete la aceptación manual de los flujos que Agustín vaya a usar desde el primer día.

Hasta entonces, la puesta en marcha debe ensayarse sólo con cuentas y datos ficticios.

## Zona horaria del gimnasio

Antes de crear horarios, confirmá `GYM_TIMEZONE` en el entorno del servidor. Por defecto es `America/Argentina/Buenos_Aires` (UTC−3, sin horario de verano). Las plantillas de clase guardan la hora local del gimnasio y de ahí se calcula cada clase concreta.

Orden sugerido para dejar la agenda funcionando: servicios → profesores → miembros → **Horarios** (plantilla semanal por clase) → **Generar clases** para las próximas semanas → turnos fijos de quienes tienen horario habitual.

Para instalar en un servidor con HTTPS, respaldos y la operación diaria, ver [`DEPLOYMENT.md`](DEPLOYMENT.md).
