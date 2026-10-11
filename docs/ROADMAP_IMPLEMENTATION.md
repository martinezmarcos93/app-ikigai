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

- [x] Matriz de autorización por rol y alcance para todos los endpoints, auditada de forma automática (`route-security.test.ts`: toda ruta registrada tiene fila, ninguna ruta privada responde a un anónimo, las de administración rechazan a miembros y profesores) y comprobada en navegador (`e2e-roles.py`). Falta la revisión independiente (siguiente ítem). Texto original: con pruebas negativas de acceso cruzado entre miembros, profesores y administración. La matriz existe, pero todavía registra cobertura por confirmar para algunos endpoints y su ejecución depende de CI funcional.
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
- [~] Ensayo de backup/restore ejecutado localmente sobre PostgreSQL 16 en contenedores (`deploy/restore-check.sh`: migraciones, tablas, usuarios y auditoría restaurados); falta CI verde y el procedimiento sobre el proveedor de producción. Se agregó un guard que rechaza `DATABASE_URL` remotas antes de invocar herramientas PostgreSQL y un test negativo en el workflow; el PR #16 se fusionó, pero CI falló antes de asignar runners (`runner_id: 0`, `steps: []`), por lo que el guard aún no tiene ejecución automatizada demostrada.
- [ ] Completar revisión de autorización y seguridad independiente antes de datos reales. No se considera realizada por esta revisión de código; requiere auditoría independiente y resolución de hallazgos.
- **Criterio de cierre:** pruebas de autorización y recuperación aprobadas; límites operativos documentados; restauración demostrada; revisión independiente y riesgos pendientes explícitos.

### Fase 4 — Conectar progresivamente el portal con la API
**Barrido actual: primera puesta en marcha y eliminación de configuración de demo.** La entrada principal pasa al portal conectado; el prototipo se conserva aparte, vacío y sin autenticación.

- [x] Crear `docs/INITIAL_SETUP.md` con el procedimiento de primera instalación, creación segura del administrador y orden inicial de configuración.
- [x] Retirar los registros semilla del prototipo local e invalidar su almacenamiento de la versión anterior.
- [x] Configurar la PWA para abrir el portal conectado y conservar el prototipo en `demo.html`.
- [x] Añadir al resumen administrativo una lista de primera puesta en marcha para servicios, profesores y miembros.
- [x] Corregir el service worker para no almacenar respuestas de `/api/` ni respuestas con `Cache-Control: no-store`; las respuestas autenticadas no deben entrar en caché.
- [x] Primer inicio de sesión, navegación a configuración y actualización/limpieza del service worker comprobados en navegador real (`e2e-admin.py`, `e2e-pwa.py`); el CI sigue sin ejecutarse por facturación. Texto original: Sigue bloqueado por la falta de ejecución real de GitHub Actions y de evidencia de navegador.
- [x] Añadir un flujo de administración para vincular un perfil de profesor al usuario administrador existente: exige cuenta activa, rol admin previo, correo coincidente, CSRF, transacción y auditoría; agrega coach sin revocar admin ni crear otra cuenta.
- [x] Flujo de roles múltiples validado con PostgreSQL y en navegador (`e2e-admin.py`: la cuenta conserva administración y profesor tras recargar; los permisos de cada rol se siguen validando en servidor). Texto original: comprobar que la sesión conserva ambos roles y que los permisos de cada rol siguen validados en servidor.
- [x] Diseñar e implementar la configuración institucional persistida en PostgreSQL: nombre, contacto, dirección y horarios, con valores vacíos/no configurados por defecto; lectura/escritura sólo de administración, CSRF, respuestas no cacheables y auditoría de campos modificados.
- [x] Configuración institucional validada contra PostgreSQL con lectura, edición y recarga real en navegador, sin tocar `localStorage` (`e2e-admin.py`). Texto original: no usar valores de demostración como configuración real.

**Estado: en curso — primer barrido de inventario y endurecimiento del cliente.** El portal ya consume parcialmente varios endpoints; no se considera completa la integración ni se presupone que CI esté verde.

- [x] Inventariar cada superficie relevante y clasificar su estado inicial en [docs/PORTAL_API_INVENTORY.md](PORTAL_API_INVENTORY.md). El inventario está basado en lectura estática y marca explícitamente los flujos cuya ejecución aún debe comprobarse.
- [ ] Completar y probar la capa de cliente API uniforme con sesión, CSRF, errores, carga, estados vacíos y política de reintentos seguros. Se añadió navegación de miembros en páginas de 25 registros usando el `limit/offset` del servidor; el contrato estático se amplió, pero su ejecución CI y la prueba de navegador siguen pendientes. Se añadió validación de paginación de miembros, codificación de parámetros, claves idempotentes estables por formulario para reintentos financieros sin cambiar el payload y smoke tests del cliente en `scripts/test-api-client.mjs`, incorporados al workflow; las ejecuciones de GitHub Actions de esta rama terminan en fallo antes de exponer pasos o logs; por ello no hay evidencia de que los tests hayan empezado y no se atribuye ese fallo al código. En el barrido actual se añadieron cinco contratos al smoke test del cliente: limpieza de identidad/CSRF tras 401, limpieza aun si logout falla, normalización de errores no JSON, métodos/CSRF/URL codificada para servicios y lectura/escritura de configuración institucional. Quedan pendientes de ejecución real.
- [x] Flujos de miembros, servicios, membresías, cuenta corriente, profesores e invitaciones completos y probados en navegador (`e2e-admin.py`, `e2e-roles.py`), sin mezclar el estado de la demo.
- [x] Mantener explícita la separación entre demo local con `localStorage` y portal autenticado con datos del servidor; verificar que ningún flujo conectado informe sincronización local ficticia.
- [x] Permisos de navegación auditados como ayuda de UX (el miembro y el profesor no ven lo exclusivo de administración, `e2e-roles.py`), conservando la autorización efectiva en el servidor.
- [x] Pruebas de contrato entre portal y API para los flujos conectados (17 en `scripts/test-api-client.mjs`) más el recorrido en navegador contra la API real, empezando por sesión, miembros y servicios. Se ampliaron los contratos del cliente para sesión expirada, logout, errores no JSON, servicios y configuración institucional; su ejecución sigue pendiente.
- **Criterio de cierre:** cada flujo declara su origen de datos, manejo de errores y permisos; operaciones críticas probadas contra PostgreSQL.

### Fase 5 — Completar los flujos del gimnasio
- [x] Agenda recurrente y generación/consulta de instancias concretas: plantillas semanales, generación idempotente con zona horaria del gimnasio, turnos fijos y cancelación de clases (API, portal «Horarios» y prueba de navegador). Falta la revisión visual móvil.
- [x] Capacidad por franja, disciplina y profesor, con consistencia ante solicitudes concurrentes (cada clase guarda su capacidad; restricciones únicas contra duplicados).
- [x] Reservas, cancelación con corte de 40 minutos y promoción transaccional de la lista de espera (`bookings.integration.test.ts`, `e2e-roles.py`).
- [x] Asistencia histórica por instancia, con corrección idempotente y auditoría (`attendance.integration.test.ts`, `e2e-roles.py`).
- [x] Membresías, vigencias, cargos, pagos parciales, ajustes y saldos a favor (`memberships.integration.test.ts`, `financial-rules.integration.test.ts`, `e2e-admin.py`).
- [x] Obligación mensual fija de cada profesor con pagos parciales, ajustes y saldo por período (`financial-rules.integration.test.ts`, `e2e-admin.py`), sin relación porcentual con reservas/asistencia.
- [x] Rutinas versionadas, ejercicios y asignaciones con permisos y alcance (`routines.integration.test.ts`).
- [x] Avisos, ausencias y llegadas tarde sin sanciones automáticas: el miembro avisa que no irá o que llegará tarde (informativo: no cancela ni genera cargos), el profesor lo ve en su lista y registra «llegó tarde» al tomar asistencia, y el historial lo muestra (`notices.integration.test.ts`, `e2e-roles.py`).
- [x] Pruebas de aceptación de extremo a extremo para administración, profesor y miembro en navegador real: `scripts/e2e-admin.py`, `scripts/e2e-roles.py`, `scripts/e2e-agenda.py`, `scripts/e2e-pwa.py` y `scripts/audit-mobile.py` (manuales: el CI no tiene navegador).
- **Criterio de cierre:** flujos principales con persistencia, reglas de negocio, autorización y pruebas; no basta con que exista una pantalla.

### Fase 6 — PWA y experiencia Android
- [x] Revisar responsive a 320, 360, 390, 412 y 480 px (auditoría automatizada `scripts/audit-mobile.py`, 0 incumplimientos); tablet y escritorio verificados visualmente en 1280 px.
- [ ] Verificar áreas seguras, orientación, zoom/texto ampliado, teclado virtual y scroll de tablas dentro de sus contenedores.
- [x] Objetivos táctiles de al menos 44×44 px y etiquetas de campos comprobados automáticamente; foco, contraste y movimiento reducido siguen para revisión manual.
- [~] Service worker, caché, modo sin conexión, recuperación y limpieza de versiones anteriores validados en navegador (`e2e-pwa.py`); falta la instalación como app y la actualización en un dispositivo real.
- [ ] Probar Chrome Android en un dispositivo de gama baja y otro de gama media/alta, además de emulación.
- [x] La interfaz no presenta una escritura sin conexión como hecha: sin red las operaciones fallan con el aviso de desconexión y no quedan guardadas (`e2e-pwa.py`).
- **Criterio de cierre:** checklist móvil verificada y evidencias registradas; problemas específicos de dispositivo documentados.

### Fase 7 — Infraestructura y preproducción
- [~] Estrategia de despliegue decidida: un único servidor con Docker, dominio propio y HTTPS automático con Caddy (`docs/DEPLOYMENT.md`). Falta elegir y contratar el servidor y el dominio concretos.
- [x] Desarrollo, pruebas y producción separados: `deploy/compose.yaml` levanta el entorno de producción con HTTPS, cookies `Secure`, secretos por variable de entorno, mismo origen para portal y API (sin CORS) y CSP estricta; comprobado con `e2e-roles.py` y `audit-mobile.py` sobre ese entorno.
- [x] PostgreSQL con migraciones automáticas al desplegar, `deploy/backup.sh` (retención y cifrado opcional) y `deploy/restore-check.sh` (restauración ensayada en una base temporal). Falta la copia fuera del servidor y, si se prefiere, un PostgreSQL administrado.
- [~] Logs JSON estructurados con `reqId`, health checks (`/healthz`, `HEALTHCHECK` de las imágenes) y tabla de auditoría ya existen; faltan métricas y alertas (se definen con datos reales).
- [x] Documentado en `docs/DEPLOYMENT.md`: instalación, actualización y rollback, respaldos, rotación de secretos, observabilidad y respuesta a incidentes.
- **Criterio de cierre:** entorno reproducible, restauración ensayada y procedimiento de rollback documentado.

### Fase 8 — Piloto controlado y decisión de lanzamiento
- [x] Escenarios de aceptación ejecutados con datos ficticios y tres roles separados, cada uno en su propio contexto de navegador (`e2e-roles.py`).
- [x] Concurrencia (reservas con cupo y lista de espera, `bookings.integration.test.ts`), idempotencia (cuenta corriente, pagos, rate limit compartido), fallos de red y recuperación (`e2e-pwa.py`) y expiración, cierre y revocación de sesión con recuperación (`e2e-session.py`) probados.
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


## Continuidad de implementación — Fases 4, 5 y 6

El plan detallado y ejecutable para Claude Code está en [`docs/CLAUDE_CODE_PHASES_4_5_6_HANDOFF.md`](./CLAUDE_CODE_PHASES_4_5_6_HANDOFF.md). Debe leerse junto con `docs/ACCEPTANCE_TESTS.md` y `docs/PORTAL_API_INVENTORY.md`; no reemplaza los criterios de cierre de esta hoja de ruta.

**Avance remoto de esta rama:** se añadieron contratos de API cliente y los métodos `createBooking` / `cancelBooking` según las rutas existentes del backend. El cliente ya puede expresar ambas operaciones, pero el flujo de agenda no está completo porque aún falta la lectura/gestión de instancias y la UI conectada. Las pruebas escritas no equivalen a pruebas ejecutadas.

**No marcar fases como cerradas** hasta contar con pruebas reales ejecutadas, aceptación por rol, pruebas de autorización negativa, validación móvil y cierre de los bloqueos de seguridad/operación aplicables. Si la infraestructura CI sigue sin asignar runner, Claude Code debe ejecutar localmente los scripts disponibles y documentar el resultado exacto, sin borrar el bloqueo de CI externo.


## Barrido remoto — agenda/API (2026-10-10)

En la rama `feat/phase-4-schedule-api-sweep` se añade `GET /api/v1/class-sessions` con filtros temporales acotados, paginación y alcance de profesor, junto con `IkigaiApi.listClassSessions()` y pruebas de contrato del cliente. La UI todavía no consume este endpoint. La validación se mantiene pendiente hasta ejecutar typecheck, pruebas, build y migraciones PostgreSQL en un runner disponible; el estado fallido sin pasos/logs de GitHub Actions no se interpreta como fallo funcional confirmado.


## Barrido funcional y PWA — 2026-10-10

**Punto 4 — agenda, reservas, asistencia, miembros y cuenta corriente:** la revisión estática encontró y corrigió una discrepancia real en cancelación de reservas: el portal enviaba el identificador de sesión cuando la API exige el identificador de reserva. La consulta de agenda ahora incluye `my_booking_id`, y la acción de cancelación usa ese ID. Se añadió una aserción de contrato estática que comprueba tanto la respuesta SQL como el uso en el portal. El resto de los flujos sigue sujeto a aceptación por rol y pruebas contra PostgreSQL; no se considera cerrado sólo por la inspección del código.

**Punto 5 — Android/PWA:** se añadieron protecciones CSS para áreas seguras, evitar desbordamiento horizontal global, conservar el scroll táctil de tablas dentro de sus contenedores, asegurar 44 px de área táctil para botones pequeños en móvil, evitar zoom automático en campos y respetar movimiento reducido. Se incrementó la caché del shell a `ikigai-shell-v8`.

**Validación:** se añadieron aserciones estáticas; no se pudieron ejecutar por el bloqueo actual de GitHub Actions. Quedan pendientes emulación visual en 320/360/390/412/480 px, instalación/actualización/offline, prueba en dos dispositivos Android y pruebas de integración/autorización reales. La PWA y los flujos del gimnasio no se declaran completos ni aprobados para datos reales.


## Estado real y barrido del 11/10/2026

**Hallazgo central:** GitHub Actions nunca llegó a ejecutarse para este repositorio privado (los jobs no arrancan: «recent account payments have failed or your spending limit needs to be increased»), de modo que **el código no estaba validado**. Al correr localmente todo lo que define el workflow aparecieron 16 errores de tipos y 7 tests fallando, además de un archivo de pruebas que ni compilaba. Hasta que la facturación se resuelva, la validación vigente es la local: `npm ci`, `npm run check`, `npm run db:migrate` y `npm test` contra un PostgreSQL descartable con `IKIGAI_INTEGRATION_TESTS=1`, más los pasos del primer job del workflow.

Resultado del barrido: typecheck sin errores; 89 pruebas del servidor pasando; pasos del primer job del workflow verificados.

- **Autenticación antes de validación:** un hook global exige sesión en toda ruta privada, así que un anónimo recibe `401` y no sondea esquemas (antes `400`).
- **Auditoría automática de la matriz de autorización** (`route-security.test.ts`): toda ruta registrada debe figurar en la matriz, ninguna ruta privada responde a un anónimo y las rutas «Administración» rechazan a miembros y profesores.
- **Agenda recurrente completa** (ver Fase 5): era el hueco funcional mayor, porque existían las tablas pero ninguna ruta para crear horarios ni generar clases.
- **Portal:** los avisos de éxito se ocultaban enseguida y los botones de los formularios volvían a decir «Guardar»; corregido.

### Alta por invitación y auditoría móvil (11/10/2026)

- **Hueco cerrado en el alta:** el endpoint `POST /auth/accept-invitation` existía pero no había ninguna pantalla para usarlo; un miembro o profesor invitado no podía crear su contraseña sin `curl`. Se agregó `accept-invitation.html` (token en el fragmento, borrado de la barra, contraseña con confirmación), el método `acceptInvitation` del cliente con validación previa y su contrato en CI. «Accesos» entrega ahora un enlace listo para compartir en lugar de un token crudo.
- **Fase 6, comprobaciones automatizadas** con `scripts/audit-mobile.py` (Chromium táctil, 320/360/390/412/480 px, 13 pantallas): sin desbordamiento horizontal, objetivos táctiles de al menos 44 px, campos con etiqueta, imágenes con `alt` y sin `id` duplicados. Resultado: 0 incumplimientos tras ampliar los enlaces de texto bajo los formularios (medían 16–18 px).
- **Accesibilidad:** ids duplicados entre formularios de una misma pantalla (por ejemplo `email` al invitar a un miembro y a un profesor) se desambiguan automáticamente.
- **Sigue pendiente (no automatizable aquí):** dispositivo Android real de gama baja y de gama media/alta, instalación y actualización de la PWA en el dispositivo, zoom/texto ampliado y teclado virtual.

### Esquemas estrictos y avisos de reserva (11/10/2026)

- **Hallazgo de seguridad:** la matriz documentaba que «la validación de esquema rechaza propiedades desconocidas», pero Fastify, por defecto, las **elimina en silencio** (`removeAdditional: true`): un login con `role: "admin"` de más devolvía `401` de credenciales, no `400`. Era inofensivo (los handlers sólo leen campos conocidos) pero no era lo documentado ni una defensa real contra la asignación masiva. Ahora el servidor usa `removeAdditional: false` y rechaza con `400`; `strict-schemas.test.ts` lo sostiene y además exige que todo objeto de todo esquema de cuerpo declare `additionalProperties: false`.
- **Avisos de ausencia y llegada tarde** (migración `0007`): ver el modelo de datos. Son informativos y no tienen ningún efecto económico.

- **Dependencias:** `npm audit` (con y sin dependencias de desarrollo) da 0 vulnerabilidades en el servidor al 11/10/2026.
