# Ikigai Training — hoja de ruta maestra de implementación

> Documento de control del trabajo. El orden de las fases es deliberado: no adelantar cambios visuales o funcionales que dependan de una base todavía inestable.

## Principios no negociables

- **La identidad de Ikigai se conserva.** La marca existente y su paleta oscura con rojo son la referencia de partida, no un elemento descartable. Antes de crear variantes hay que inspeccionar el archivo original, identificar sus proporciones, símbolos, tipografía y tonos reales, y registrar una paleta medida. No inventar un logo sustituto ni reemplazar el logo por iniciales.
- **Una sola fuente de verdad para la marca.** Los colores y recursos aprobados se centralizan en tokens y archivos documentados. La demo y el portal conectado no deben derivar en dos identidades visuales distintas.
- **PWA primero.** La experiencia Android se valida en navegador y como PWA antes de decidir si hace falta una aplicación nativa.
- **Seguridad en servidor.** Ocultar controles en el cliente no constituye autorización.
- **Historial financiero inmutable.** Los cambios de tarifas no reescriben movimientos históricos; se permiten pagos parciales, saldos a favor y ajustes trazables. No se agregan multas automáticas ni participación porcentual para profesores.
- **Sin datos reales hasta aprobar seguridad y operación.** Toda validación inicial usa datos ficticios.
- **No declarar terminada una tarea sin evidencia.** Cada elemento se etiqueta como implementado, comprobado por CI, validado manualmente o bloqueado por prueba local/infraestructura.

## Orden de ejecución

### Fase 1 — Base estable, CI reproducible y documentación unificada
**Estado: completada.**

- [x] Confirmar `main` como fuente de verdad y trabajar en una rama de implementación.
- [x] Registrar el orden de fases y los criterios de cierre en esta hoja de ruta.
- [x] Unificar el README con esta hoja de ruta para evitar planes duplicados o contradictorios.
- [x] Revisar el workflow de CI y ampliar comprobaciones estáticas útiles: valida campos del manifiesto, existencia de iconos/rutas del shell y presencia de la hoja de ruta.
- [x] Generar y versionar `server/package-lock.json` con Node.js 22/npm y cambiar CI a `npm ci`.
- [x] Ejecutar el pipeline completo tras el lockfile: `npm ci`, typecheck, pruebas, build, migraciones PostgreSQL y validación de recursos PWA finalizaron correctamente en el commit de cierre de la fase.
- [x] Mantener la demo local separada del portal conectado a la API y dejar claros sus límites en el README.
- **Criterio de cierre:** documentación enlazada y no contradictoria; dependencias bloqueadas; CI verde en el commit de la fase; ninguna afirmación de producción sin evidencia.

### Fase 2 — Identidad visual, logo y assets de Ikigai
**Prioridad visual explícita: máxima. Estado: sistema de marca y assets funcionales integrados; variante fiel/vectorial del logo bloqueada por falta del maestro editable.** Primer sistema de tokens, PWA, sprite de iconos y cuatro ilustraciones SVG creados. La variante transparente del logo queda bloqueada por la ausencia de un maestro editable; no se falsea con borrado automático del negro.

- [x] Inspeccionar el logo actual original: 720×690 px; composición centrada con nombre angular metálico, samurái con pesas, fondo rojo geométrico y fondo negro; documentar límites del JPG.
- [x] Medir y documentar la paleta real: rojo dominante `#E31A20`, acento `#EC2124`, negro `#000000` y gris metálico aproximado `#808281`.
- [x] Definir tokens semánticos compartidos para fondos, superficies, texto, bordes, color de marca, estados, foco y contraste.
- [x] Unificar los tokens principales de la demo y del portal; quedan tonos locales de estado que deben revisarse visualmente antes de una aprobación definitiva.
- [ ] Crear variantes fieles y justificadas del logo: principal, símbolo, horizontal/compacta y monocromática cuando el original permita derivarlas sin deformarlo. **Bloqueado para variantes transparentes/vectoriales:** el único archivo fuente disponible es JPG; se necesita el maestro editable o recorte manual revisado. No eliminar el negro por algoritmo.
- [ ] Preparar SVG optimizado cuando sea posible sin alterar la marca; PNG con transparencia real para usos rasterizados que lo requieran.
- [x] Crear favicon y set PWA 192×192, 512×512 y maskable; preservar proporciones y zona segura.
- [x] Crear e integrar un sprite SVG funcional en las navegaciones de demo y portal.
- [x] Crear un primer conjunto de ilustraciones SVG transparentes para bienvenida, miembros vacíos, desconexión y error; documentar usos y límites.
- [ ] Integrar las ilustraciones en pantallas concretas sólo tras revisar sus flujos y evitar imágenes decorativas redundantes.
- [x] Crear imagen Open Graph y guía de uso de marca, paleta, tipografía, tamaños y fondos permitidos.
- [x] Actualizar manifest, metadatos, service worker y rutas de recursos tras generar los assets.
- [x] Registrar procedencia de la marca y mantener los iconos esenciales como recursos locales.
- **Criterio de cierre:** recursos versionados, transparencia comprobada, rutas validadas por CI, coherencia entre pantallas y revisión visual en tamaños pequeños y grandes. No se considera aprobado un rediseño que sustituya o distorsione el logo original.

### Fase 3 — Seguridad y robustez del backend
**Estado: implementación ampliada; validación de CI pendiente.** La recuperación ya cuenta con pantalla pública y endpoint integrado. El token viaja en el fragmento de URL (no en la query), el cliente lo elimina del historial al leerlo y la matriz de autorización se mantiene como documento vivo. No se declara cerrada la fase hasta que CI ejecute todos los pasos y se revise la cobertura negativa.
- [ ] Completar y ejecutar la matriz de autorización por rol y alcance, con pruebas negativas de acceso cruzado entre miembros, profesores y administración. La matriz está en `docs/SECURITY_ROUTE_MATRIX.md`.
- [x] Implementar endpoints de recuperación con tokens de un solo uso, expiración de 30 minutos, digest almacenado, respuesta genérica, invalidación de sesiones y auditoría; el envío usa Resend con configuración obligatoria en producción.
- [x] Crear la pantalla pública `reset-password.html` y el cliente `reset-password.js`, enlazados desde el portal; el cliente confirma la contraseña y consume `/auth/password-reset/complete`.
- [x] Sustituir el limitador de login y recuperación por contadores atómicos PostgreSQL compartidos entre instancias; las claves se almacenan como hashes.
- [x] Revisar cookies HttpOnly/SameSite Strict/Secure en producción, expiración y revocación de sesiones, CSRF/Origin y CORS por origen exacto; agregar `Cache-Control: no-store` y `Pragma: no-cache` globales para `/api/` con pruebas. 
- [ ] Validar la configuración final de cookies, proxy y cabeceras en el hosting elegido antes de producción.
- [ ] Revisar validación de entrada, límites de tamaño, errores estables, idempotencia, transacciones y auditoría.
- [x] Revisar los payloads de auditoría; eliminar email de eventos de invitación y comprobar que recuperación/invitaciones no guardan tokens en claro. Las razones libres deben redactarse sin DNI, credenciales ni datos de contacto. 
- [ ] Mantener revisión de auditoría durante la revisión independiente y añadir controles adicionales si el modelo de datos cambia.
- [x] Documentar variables de entorno para secretos y envío de correo; no incluir credenciales reales en el repositorio. 
- [ ] Cargar secretos reales sólo en el gestor del proveedor cuando se elija el entorno de despliegue.
- [x] Añadir prueba automatizada de dump/restauración en una base PostgreSQL local descartable dentro de CI.
- [ ] Configurar backups de producción, retención, alertas y calendario de restauración tras elegir proveedor.
- [ ] Ejecutar revisión de seguridad independiente antes de datos reales; la matriz de autorización y las pruebas negativas deben ampliarse antes del cierre.
- **Criterio de cierre:** pruebas de autorización y recuperación aprobadas; límites operativos documentados; restauración demostrada; riesgos pendientes explícitos.

### Fase 4 — Conectar progresivamente el portal con la API
**Puerta de entrada:** no cerrar ni desplegar esta fase con datos reales hasta que la Fase 3 tenga CI verde verificable y autorización revisada. La pantalla de recuperación ya está integrada; los demás flujos conservan su estado parcial.
- [ ] Inventariar cada pantalla y acción de la demo y asignar su estado: local, conectada, parcial o pendiente.
- [ ] Definir una capa de cliente API uniforme con sesión, CSRF, errores, carga, reintento seguro y estados vacíos.
- [ ] Conectar miembros, servicios, membresías, cuenta corriente, profesores e invitaciones sin mezclar el estado de la demo.
- [ ] Evitar doble fuente de verdad y escrituras silenciosas en `localStorage` desde el portal autenticado.
- [ ] Resolver permisos de interfaz como ayuda de UX, conservando la autorización efectiva en el servidor.
- [ ] Añadir pruebas de contrato entre portal y API para los flujos conectados.
- **Criterio de cierre:** cada flujo declara su origen de datos, manejo de errores y permisos; operaciones críticas probadas contra PostgreSQL.

### Fase 5 — Completar los flujos del gimnasio
- [ ] Agenda recurrente y generación/consulta de instancias concretas.
- [ ] Capacidad por franja, disciplina y profesor, con consistencia ante solicitudes concurrentes.
- [ ] Reservas, cancelación con corte de 40 minutos y promoción transaccional de la lista de espera.
- [ ] Asistencia histórica por instancia, con corrección idempotente y auditoría.
- [ ] Membresías, vigencias, cargos, pagos parciales, ajustes, reintegros y saldos a favor.
- [ ] Obligación mensual fija de cada profesor con pagos parciales y saldo por período, sin relación porcentual con reservas/asistencia.
- [ ] Rutinas versionadas, ejercicios y asignaciones con permisos y alcance.
- [ ] Avisos, ausencias y llegadas tarde sin sanciones automáticas no aprobadas.
- [ ] Pruebas de aceptación de extremo a extremo para administración, profesor y miembro.
- **Criterio de cierre:** flujos principales con persistencia, reglas de negocio, autorización y pruebas; no basta con que exista una pantalla.

### Fase 6 — PWA y experiencia Android
- [ ] Revisar responsive a 320, 360, 390, 412 y 480 px, tablet y escritorio.
- [ ] Verificar áreas seguras, orientación, zoom/texto ampliado, teclado virtual y scroll de tablas dentro de sus contenedores.
- [ ] Comprobar objetivos táctiles de al menos 44×44 px, foco, etiquetas, contraste y movimiento reducido.
- [ ] Validar instalación, actualización y limpieza de caché, modo offline y recuperación al volver la conexión.
- [ ] Probar Chrome Android en un dispositivo de gama baja y otro de gama media/alta, además de emulación.
- [ ] Confirmar que la interfaz no presenta una escritura local como sincronizada con el servidor.
- **Criterio de cierre:** checklist móvil verificada y evidencias registradas; problemas específicos de dispositivo documentados.

### Fase 7 — Infraestructura y preproducción
- [ ] Elegir proveedor, dominio y estrategia de despliegue.
- [ ] Separar desarrollo, pruebas y producción; configurar HTTPS, cookies Secure, secretos y CORS por entorno.
- [ ] Configurar PostgreSQL administrado, migraciones, backups, retención y restauración probada.
- [ ] Incorporar logs estructurados, métricas, alertas, health checks y política de datos sensibles.
- [ ] Documentar despliegue, rollback, rotación de secretos y respuesta a incidentes.
- **Criterio de cierre:** entorno reproducible, restauración ensayada y procedimiento de rollback documentado.

### Fase 8 — Piloto controlado y decisión de lanzamiento
- [ ] Ejecutar escenarios de aceptación con datos ficticios y roles separados.
- [ ] Probar concurrencia, idempotencia, fallos de red, expiración de sesión y recuperación.
- [ ] Hacer piloto con alcance limitado y aprobación explícita antes de cargar datos reales.
- [ ] Definir soporte, exportación de datos, consentimiento y proveedor antes de activar notificaciones.
- [ ] Evaluar app nativa/Play Store sólo si hay una necesidad concreta no cubierta por PWA.
- **Criterio de cierre:** riesgos críticos cerrados, checklist de aceptación aprobada y plan de operación/soporte disponible.

- [x] Crear ilustraciones SVG transparentes de bienvenida, estado vacío, desconexión y error; pendiente comprobar su integración visual en las pantallas correspondientes.
- [ ] Derivar una variante de logo transparente a partir de un original vectorial/editable o mediante recorte manual revisado; no eliminar automáticamente el negro porque forma parte de los contornos.

**Nota de fidelidad:** el icono PWA actual conserva el fondo negro y la composición original. No se declara entregado un logo transparente porque el archivo fuente disponible es un JPG con contornos negros integrados; borrar el negro por umbral dañaría el samurái, las pesas y la tipografía.

## Registro de estado y bloqueos

| Área | Estado conocido al iniciar esta hoja de ruta | Próxima evidencia requerida |
| --- | --- | --- |
| Demo local | Prototipo navegable; persiste en `localStorage` | Pruebas funcionales y responsive en navegador |
| Portal/API | Interfaz conectada inicial y API separada | Contratos y pruebas por flujo |
| Backend | Auth, sesiones, reservas, ledger, asistencia, rutinas y obligaciones iniciales documentadas | Pruebas de autorización, recuperación y seguridad |
| CI | Workflow declara sintaxis, reglas de producto, assets, TypeScript, tests, build, migraciones y smoke de backup/restore | Ejecución verde verificable en GitHub Actions sobre el commit candidato |
| Marca | Tokens, iconos PWA, sprite y cuatro ilustraciones SVG versionados; fuente del logo sigue siendo JPG opaco | Revisión visual en dispositivos y archivo maestro/vectorial para variantes fieles transparentes |
| Android real | No hay evidencia de prueba en dispositivo físico en este registro | Validación en dos dispositivos |
| Producción | No aprobada para datos reales | Seguridad, infraestructura y restauración verificadas |

## Protocolo de cada barrido

1. Leer el estado real de la rama y el código afectado.
2. Elegir un conjunto amplio pero cohesivo de cambios que respete el orden.
3. Implementar y añadir pruebas o verificaciones automatizables.
4. Actualizar esta hoja de ruta y la documentación relacionada.
5. Revisar el diff y ejecutar el pipeline disponible.
6. Abrir o actualizar un PR con resultados, riesgos y pruebas manuales pendientes.
7. No integrar ni eliminar ramas históricas sin una decisión explícita o una política previamente acordada.
