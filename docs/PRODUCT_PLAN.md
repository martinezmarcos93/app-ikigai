# Ikigai Training — plan de producto Android-first

## Objetivo
Convertir el prototipo navegable en una aplicación de gestión de gimnasio fiable, cómoda y visualmente consistente en teléfonos Android de distintas marcas, densidades, tamaños y versiones del navegador. La experiencia móvil es el producto principal; tablet y escritorio son adaptaciones.

## Decisiones de producto tomadas
1. **Primero móvil, desde 320 px.** Diseñar y probar desde teléfonos compactos hasta pantallas grandes, incluyendo orientación horizontal, teclado virtual, áreas seguras y texto ampliado.
2. **PWA como primer formato distribuible.** Permite instalar desde el navegador Android y evita mantener dos interfaces. La publicación en Play Store o un contenedor nativo se evalúa más adelante si hace falta integración nativa concreta.
3. **Interacciones táctiles reales.** Objetivos de toque de al menos 44 × 44 px, formularios cómodos, foco visible, acciones principales accesibles y modales que no queden tapados por el teclado.
4. **Sin scroll horizontal de toda la página.** Las tablas extensas pueden desplazarse dentro de su propio contenedor; formularios, tarjetas y navegación deben adaptarse.
5. **Accesibilidad como requisito funcional.** Contraste suficiente, etiquetas y nombres accesibles, navegación por teclado, estados que no dependan sólo del color y respeto por movimiento reducido.
6. **No confundir demo con producción.** La PWA y el caché actual sólo mejoran la experiencia del prototipo. El almacenamiento local, el selector de rol y los datos semilla no son adecuados para múltiples usuarios ni para información real.
7. **Reglas del negocio antes de la base de datos definitiva.** Distinguir miembro, servicio, membresía/vigencia, movimientos de cuenta, reserva, asistencia, rutina, profesor y obligación mensual del profesor con el gimnasio.

## Reglas de negocio que deben quedar modeladas
- Un miembro puede contratar más de un servicio y conservar historial de sus membresías.
- Cargos y pagos son movimientos separados; se admiten pagos parciales, saldo a favor y ajustes trazables. Cambiar una tarifa no modifica movimientos históricos.
- Vencimiento, tolerancias y estados de deuda se calculan según reglas explícitas; no se agregan multas automáticas no aprobadas.
- Los turnos recurrentes pueden asignarse al alta y permanecer vigentes hasta que se cambien manualmente.
- La capacidad es configurable por franja/actividad/profesor; no debe fijarse globalmente en siete.
- Reservas y cancelaciones respetan el corte de 40 minutos acordado. La lista de espera debe promover al siguiente socio cuando se libera un cupo y registrar el cambio.
- Ausencias y llegadas tarde se registran sin sanciones automáticas por defecto.
- Cada profesor cobra directamente a sus alumnos y mantiene con Agustín una obligación mensual fija por uso del espacio, independiente de la asistencia. No calcular porcentajes sobre reservas.
- Sólo administración crea ejercicios y rutinas; los profesores pueden asignar o combinar rutinas dentro de su alcance. Los miembros sólo consultan sus propios datos.
- Los permisos deben validarse en el servidor, no sólo ocultando botones en el cliente.

## Fases de implementación

### Fase 0 — base móvil y control de calidad
- Viewport con áreas seguras, tamaños táctiles, controles sin zoom involuntario y navegación móvil accesible.
- PWA instalable y shell offline para el prototipo.
- Pruebas en anchos 320, 360, 390, 412 y 480 px; Chrome Android; orientación vertical/horizontal; teclado abierto; zoom y texto grande.
- Verificar contraste, foco, overflow, modales y navegación con lector de pantalla.

### Fase 1 — modelo y documentación funcional
- Diccionario de entidades y relaciones.
- Reglas de membresía, pagos, reservas, lista de espera, asistencia, rutinas y rendición mensual de profesores.
- Criterios de aceptación por flujo y datos ficticios coherentes.

### Fase 2 — backend y seguridad
- API, base de datos compartida, autenticación y recuperación de acceso.
- Autorización por rol y alcance en servidor, validación de entradas, auditoría y copias de seguridad.
- No migrar datos reales hasta verificar aislamiento entre cuentas.

### Fase 3 — flujos operativos
- Administración: miembros, membresías, cuenta corriente, agenda, asistencia y obligaciones mensuales.
- Profesor: grupos y alumnos asignados, asistencia, rutinas permitidas y estado de su obligación.
- Miembro: servicios, turnos habituales, reservas, cancelaciones, avisos, rutina e historial propio.

### Fase 4 — notificaciones y operación
- Push/web push cuando la infraestructura esté definida; email o WhatsApp sólo con proveedor y consentimiento apropiados.
- Observabilidad, exportaciones, recuperación ante errores, pruebas de regresión y guía de operación.

## Criterios de aceptación móvil
- No aparece scroll horizontal global a 320 px.
- Ningún control esencial queda por debajo de 44 px de alto.
- Los formularios se completan con teclado Android sin que el botón principal quede inaccesible.
- Los modales tienen scroll interno y se cierran con Escape en teclado compatible.
- Menú lateral abre, cierra con navegación, Escape y toque fuera; informa su estado a tecnologías de asistencia.
- La interfaz conserva jerarquía y legibilidad con texto ampliado y orientación horizontal.
- Una desconexión no se presenta como sincronización correcta: la demo conserva datos locales, pero la versión multiusuario necesita sincronización y resolución de conflictos del lado servidor.

## Estado actual y límites
- **Fase 0:** base Android-first/PWA y controles iniciales de calidad incorporados; las pruebas en dispositivos Android reales siguen pendientes.
- **Fase 1:** modelo de datos y criterios de aceptación documentados; los flujos principales de la demo incluyen reservas, lista de espera, asistencia histórica local y obligación mensual fija de profesores.
- **Fase 2 — base técnica en progreso:** arquitectura documentada; API TypeScript/Fastify inicial, configuración validada, cabeceras de seguridad, CORS por lista permitida, health checks, reglas puras de reserva con pruebas, esquema inicial PostgreSQL y runner de migraciones incorporados en `server/`. La autenticación, sesiones, autorización de recursos y endpoints de negocio todavía no están implementados.

La demo sigue sin ser un sistema multiusuario. La API nueva todavía sólo expone health checks; no hay autenticación real, permisos efectivos por recurso ni endpoints operativos conectados a la base de datos. El service worker almacena el shell estático y debe versionarse cuando cambien los recursos. Antes de usarlo en producción hay que probar instalación, actualización de caché, persistencia y todos los flujos en dispositivos Android reales. No cargar datos reales hasta completar autenticación, autorización, backups y pruebas de aislamiento entre cuentas.
