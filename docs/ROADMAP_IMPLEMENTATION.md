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
**Prioridad visual explícita: máxima.** Sistema de tokens, PWA, sprite de iconos y cuatro ilustraciones SVG creados. Bienvenida, lista de miembros vacía y errores de red/servidor ya muestran ilustraciones contextuales; la variante transparente del logo sigue bloqueada por la falta de un maestro editable.

- [x] Inspeccionar el logo actual original: 720×690 px; composición centrada con nombre angular metálico, samurái con pesas, fondo rojo geométrico y fondo negro; documentar límites del JPG.
- [x] Medir y documentar la paleta real: rojo dominante `#E31A20`, acento `#EC2124`, negro `#000000` y gris metálico aproximado `#808281`.
- [x] Definir tokens semánticos compartidos para fondos, superficies, texto, bordes, color de marca, estados, foco y contraste.
- [x] Unificar los tokens principales de la demo y del portal; quedan tonos locales de estado que deben revisarse visualmente antes de una aprobación definitiva.
- [ ] Crear variantes fieles y justificadas del logo: principal, símbolo, horizontal/compacta y monocromática cuando el original permita derivarlas sin deformarlo. **Bloqueado para variantes transparentes/vectoriales:** el único archivo fuente disponible es JPG; se necesita el maestro editable o recorte manual revisado. No eliminar el negro por algoritmo.
- [ ] Preparar SVG optimizado cuando sea posible sin alterar la marca; PNG con transparencia real para usos rasterizados que lo requieran.
- [x] Crear favicon y set PWA 192×192, 512×512 y maskable; preservar proporciones y zona segura.
- [x] Crear e integrar un sprite SVG funcional en las navegaciones de demo y portal.
- [x] Crear un primer conjunto de ilustraciones SVG transparentes para bienvenida, miembros vacíos, desconexión y error; documentar usos y límites.
- [x] Integrar bienvenida en el login, miembros vacíos en la tabla de miembros y desconexión/error de servidor en avisos contextuales; el texto accionable se conserva.
- [x] Incluir las cuatro ilustraciones pequeñas en el shell PWA y versionar la caché para que los estados de desconexión/error estén disponibles offline.
- [x] Crear imagen Open Graph y guía de uso de marca, paleta, tipografía, tamaños y fondos permitidos.
- [x] Actualizar manifest, metadatos, service worker y rutas de recursos tras generar los assets.
- [x] Registrar procedencia de la marca y mantener los iconos esenciales como recursos locales.
- **Criterio de cierre:** recursos versionados, transparencia comprobada, rutas validadas por CI, coherencia entre pantallas y revisión visual en tamaños pequeños y grandes. No se considera aprobado un rediseño que sustituya o distorsione el logo original.

### Fase 3 — Seguridad y robustez del backend
**Estado: implementación en validación. No habilita todavía datos reales.**

- [ ] Completar matriz de autorización por rol y alcance para todos los endpoints, con pruebas negativas de acceso cruzado entre miembros, profesores y administración. La matriz existe, pero todavía registra cobertura por confirmar para algunos endpoints y su ejecución depende de CI funcional.
- [x] Añadir regresiones para el helper de alcance miembro/profesor/administración y comprobar en PostgreSQL que un profesor asignado puede gestionar asistencia mientras otro profesor queda bloqueado.
- [x] Implementar recuperación de contraseña con token aleatorio de un solo uso, digest persistido, expiración de 30 minutos, invalidación de tokens previos, revocación de sesiones y respuesta que evita enumerar cuentas.
- [x] Añadir la pantalla de solicitud/confirmación; el token viaja en el fragmento URL, se elimina de la barra al leerlo y la página no carga recursos de terceros.
- [x] Exigir en producción un adaptador de entrega HTTPS autenticado para enviar el enlace de recuperación; la configuración del proveedor concreto sigue siendo una tarea de despliegue.
- [x] Sustituir el rate limit sólo en memoria por un límite fijo compartido en PostgreSQL para login, recuperación y rutas administrativas sensibles; la clave se deriva mediante HMAC-SHA-256 con `SESSION_SECRET` y se limpian buckets antiguos.
- [x] Añadir prueba de integración que usa dos instancias/pools independientes y comprueba que el sexto intento excede el límite compartido.
- [x] Rechazar URLs públicas de recuperación con credenciales, query o fragmento preexistente; verificar HTTPS, origen CORS y clave del adaptador.
- [x] Revisar cookies HttpOnly/SameSite/Secure, CSRF, Origin, CORS exacto, expiración y revocación de sesiones, cabeceras y respuestas `no-store`; conservar las defensas existentes y añadir controles de producción.
- [x] Mantener esquemas de entrada estrictos, límite de cuerpo, errores estables, idempotencia, transacciones y auditoría; reducir payloads de auditoría que contenían emails o datos descriptivos innecesarios.
- [x] Validar configuración por entorno y documentar secretos del proveedor de recuperación; no se agregan secretos reales al repositorio.
- [x] Añadir un ensayo automatizado de backup/restore PostgreSQL que comprueba esquema, historial de migraciones y datos restaurados en una base descartable.
- [ ] Confirmar el ensayo de backup/restore con CI verde en el commit final y definir el procedimiento de backup/restore para el proveedor de producción. Se agregó un guard que rechaza `DATABASE_URL` remotas antes de invocar herramientas PostgreSQL y un test negativo en el workflow; el PR #16 se fusionó, pero CI falló antes de asignar runners (`runner_id: 0`, `steps: []`), por lo que el guard aún no tiene ejecución automatizada demostrada.
- [ ] Completar revisión de autorización y seguridad independiente antes de datos reales. No se considera realizada por esta revisión de código; requiere auditoría independiente y resolución de hallazgos.
- **Criterio de cierre:** pruebas de autorización y recuperación aprobadas; límites operativos documentados; restauración demostrada; revisión independiente y riesgos pendientes explícitos.

### Fase 4 — Conectar progresivamente el portal con la API
**Barrido actual: primera puesta en marcha y eliminación de configuración de demo.** La entrada principal pasa al portal conectado; el prototipo se conserva aparte, vacío y sin autenticación.

- [x] Crear `docs/INITIAL_SETUP.md` con el procedimiento de primera instalación, creación segura del administrador y orden inicial de configuración.
- [x] Retirar los registros semilla del prototipo local e invalidar su almacenamiento de la versión anterior.
- [x] Configurar la PWA para abrir el portal conectado y conservar el prototipo en `demo.html`.
- [x] Añadir al resumen administrativo una lista de primera puesta en marcha para servicios, profesores y miembros.
- [x] Corregir el service worker para no almacenar respuestas de `/api/` ni respuestas con `Cache-Control: no-store`; las respuestas autenticadas no deben entrar en caché.
- [ ] Validar CI y comprobar manualmente el primer inicio de sesión, dashboard vacío, navegación a configuración y actualización/limpieza del service worker. Sigue bloqueado por la falta de ejecución real de GitHub Actions y de evidencia de navegador.
- [x] Añadir un flujo de administración para vincular un perfil de profesor al usuario administrador existente: exige cuenta activa, rol admin previo, correo coincidente, CSRF, transacción y auditoría; agrega coach sin revocar admin ni crear otra cuenta.
- [ ] Validar el flujo de roles múltiples con PostgreSQL/CI y prueba manual; comprobar que la sesión conserva ambos roles y que los permisos de cada rol siguen validados en servidor.
- [x] Diseñar e implementar la configuración institucional persistida en PostgreSQL: nombre, contacto, dirección y horarios, con valores vacíos/no configurados por defecto; lectura/escritura sólo de administración, CSRF, respuestas no cacheables y auditoría de campos modificados.
- [ ] Validar la configuración institucional contra PostgreSQL mediante CI y prueba manual de lectura/edición/recarga; no usar valores de demostración como configuración real.

**Estado: en curso — primer barrido de inventario y endurecimiento del cliente.** El portal ya consume parcialmente varios endpoints; no se considera completa la integración ni se presupone que CI esté verde.

- [x] Inventariar cada superficie relevante y clasificar su estado inicial en [docs/PORTAL_API_INVENTORY.md](PORTAL_API_INVENTORY.md). El inventario está basado en lectura estática y marca explícitamente los flujos cuya ejecución aún debe comprobarse.
- [ ] Completar y probar la capa de cliente API uniforme con sesión, CSRF, errores, carga, estados vacíos y política de reintentos seguros. Se añadió navegación de miembros en páginas de 25 registros usando el `limit/offset` del servidor; el contrato estático se amplió, pero su ejecución CI y la prueba de navegador siguen pendientes. Se añadió validación de paginación de miembros, codificación de parámetros, claves idempotentes estables por formulario para reintentos financieros sin cambiar el payload y smoke tests del cliente en `scripts/test-api-client.mjs`, incorporados al workflow; las ejecuciones de GitHub Actions de esta rama terminan en fallo antes de exponer pasos o logs; por ello no hay evidencia de que los tests hayan empezado y no se atribuye ese fallo al código. En el barrido actual se añadieron cinco contratos al smoke test del cliente: limpieza de identidad/CSRF tras 401, limpieza aun si logout falla, normalización de errores no JSON, métodos/CSRF/URL codificada para servicios y lectura/escritura de configuración institucional. Quedan pendientes de ejecución real.
- [ ] Completar los flujos de miembros, servicios, membresías, cuenta corriente, profesores e invitaciones sin mezclar el estado de la demo.
- [x] Mantener explícita la separación entre demo local con `localStorage` y portal autenticado con datos del servidor; verificar que ningún flujo conectado informe sincronización local ficticia.
- [ ] Auditar permisos de navegación y renderizadores como ayuda de UX, conservando la autorización efectiva en el servidor.
- [ ] Añadir pruebas de contrato entre portal y API para los flujos conectados, empezando por sesión, miembros y servicios. Se ampliaron los contratos del cliente para sesión expirada, logout, errores no JSON, servicios y configuración institucional; su ejecución sigue pendiente.
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

- [ ] Crear y revisar ilustraciones de estados vacíos, bienvenida, desconexión y error.
- [ ] Derivar una variante de logo transparente a partir de un original vectorial/editable o mediante recorte manual revisado; no eliminar automáticamente el negro porque forma parte de los contornos.

**Nota de fidelidad:** el icono PWA actual conserva el fondo negro y la composición original. No se declara entregado un logo transparente porque el archivo fuente disponible es un JPG con contornos negros integrados; borrar el negro por umbral dañaría el samurái, las pesas y la tipografía.

## Registro de estado y bloqueos

| Área | Estado conocido al iniciar esta hoja de ruta | Próxima evidencia requerida |
| --- | --- | --- |
| Demo local | Prototipo navegable; persiste en `localStorage` | Pruebas funcionales y responsive en navegador |
| Portal/API | Interfaz conectada inicial y API separada | Contratos y pruebas por flujo |
| Backend | Auth, sesiones, reservas, ledger, asistencia, rutinas y obligaciones iniciales documentadas | Pruebas de autorización, recuperación y seguridad |
| CI | Workflow de sintaxis, reglas de producto, TypeScript, tests, build y migraciones | Lockfile, instalación reproducible y ejecución verde |
| Marca | Logo JPG existente; paleta oscura/roja con diferencias entre CSS | Inspección visual del original y tokens medidos |
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
