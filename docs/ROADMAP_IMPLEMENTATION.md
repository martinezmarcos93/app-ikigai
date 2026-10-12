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
- [~] Revisión adversarial de seguridad (11/10/2026) hecha por un agente de IA que partió de cero, sin el contexto de las revisiones anteriores: ver «Revisión adversarial» al final. **No es una auditoría independiente humana**: sigue pendiente una revisión externa antes de datos reales, pero ya no parte de un código sin revisar.
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
- [x] Texto ampliado del sistema (1,3× y 1,6×), teclado virtual y scroll de tablas verificados en Chrome Android del emulador con `scripts/audit-android.py` (0 incumplimientos en 12 pantallas por escala). Áreas seguras: `viewport-fit=cover` y protecciones CSS presentes; la prueba con muesca/barra de gestos reales queda para el dispositivo físico.
- [x] Objetivos táctiles de al menos 44×44 px y etiquetas de campos comprobados automáticamente; foco, contraste y movimiento reducido siguen para revisión manual.
- [~] Service worker, caché, modo sin conexión, recuperación y limpieza de versiones anteriores validados en Chromium (`e2e-pwa.py`) y en Chrome Android del emulador (`audit-android.py`: manifiesto, íconos, service worker activo, shell sin red, actualización v15→v16 con una sola caché). Falta la instalación como app («Agregar a pantalla de inicio»/TWA) en un dispositivo real.
- [~] Emulación hecha: AVD Android 14, 1,5 GB de RAM y 2 núcleos (gama baja), Chrome 113 (versión antigua, mínimo conservador). **Pendiente (requiere tus teléfonos):** un dispositivo físico de gama baja y otro de media/alta; se corre `scripts/audit-android.py` por depuración USB y se anotan las diferencias.
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
- [~] Exportación de datos (`GET /members/:id/export`, descarga desde el portal), supresión por anonimización (`POST /members/:id/anonymize`) y texto de consentimiento definidos en `docs/DATA_PROTECTION.md`. Faltan la revisión jurídica, el soporte y el proveedor de notificaciones (no hay notificaciones: el API no envía correos salvo el adaptador de recuperación).
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
| Android real | Emulador (Android 14, gama baja, Chrome 113) aprobado con `audit-android.py`; sin prueba en dispositivo físico | Validación en dos dispositivos |
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

### Accesos creados por administración y guía de primer uso (11/10/2026)

- **Decisión:** el alta de miembros y profesores deja de ser por invitación con enlace y pasa a ser **solo de administración**, con usuario y clave temporal (migración `0009`). El usuario sale del nombre (`ikigai-miembro-marcos`, `ikigai-profesor-florencia`; ante un homónimo se agrega el apellido o un número) y la clave es aleatoria con formato (`MM-Ikigai-K7Q4-9XMP`). Se descartó el formato `MM-Ikigai-2026` propuesto porque es adivinable por cualquiera que conozca el nombre; las iniciales y la marca se conservan y los 8 caracteres finales salen de un generador criptográfico (~39 bits, con límite de intentos de acceso y cambio obligatorio en el primer ingreso).
- Quien no tiene correo propio recibe uno interno (`…@cuentas.ikigai.invalid`) y entra por usuario; la recuperación por correo no le aplica, la reemplaza «Restablecer clave».
- Nuevo: `POST /auth/change-password` (la clave actual, mínimo 12 caracteres, cierra las demás sesiones), bloqueo de la API mientras la clave sea temporal, `POST /admin/accounts`, `GET /admin/accounts`, `POST /admin/accounts/:id/reset-password`, `POST /auth/tour-completed`. Las rutas de invitación siguen existiendo en el servidor pero ya no tienen pantalla.
- **Guía de primer uso** (`tour.js`): globos de texto para administración (13 pasos, escritorio y teléfono); se recuerda en el servidor por persona.
- `scripts/e2e-roles.py` reescrito para el nuevo flujo y `scripts/e2e-tour.py` nuevo. Para los demás scripts de navegador, el administrador de prueba debe tener la guía hecha (`UPDATE users SET tour_completed_at = now()`), si no la guía se abre sola sobre la pantalla.

### Simulaciones de uso por rol, rutinas y avisos (11/10/2026)

Se escribieron tres simulaciones de una persona real con su navegador (`scripts/sim-admin.py`, `sim-profesor.py`, `sim-miembro.py`, piezas comunes en `_sim.py`; la del miembro corre en 390 px, como un teléfono). Cada una hace todo lo que su rol puede hacer **y** comprueba contra la API lo que no puede. Encadenadas sobre una base recién creada: administración (primer ingreso, guía, configuración, servicios, profesores con su cuenta, miembros con edición/exportación/anonimización, accesos, horarios y turnos fijos, clases, membresías, cuenta corriente, asistencia, rutinas con versiones, avisos, consulta de las 13 pantallas) → profesora (avisos, asistencia, su cuenta, rutinas, 13 acciones prohibidas) → miembro (avisos, membresía, cuenta, agenda, rutinas, descarga de datos, 21 acciones prohibidas).

**Lo que encontraron (todo corregido, con prueba):**
- `GET /routines` respondía 500 (consulta con `GROUP BY` incompleto): la biblioteca de rutinas **nunca había funcionado** porque no existía pantalla ni prueba.
- Faltaba la pantalla para crear ejercicios y rutinas y para asignarlas: la API existía pero administración solo podía usarla con `curl`. Se agregó «Rutinas» (biblioteca, ejercicios, rutinas con versiones, asignación; el profesor ve la biblioteca y asigna solo a quienes tienen clases con él, `GET /coach/members`).
- No existían las comunicaciones: se agregaron los **avisos** (migración `0010`): administración publica para todos, solo miembros o solo profesores; cada persona los ve, los marca como leídos (contador en el menú y en el resumen) y administración los archiva.
- Un miembro que abría «Membresías» o «Cuenta corriente» veía «No hay miembros disponibles» (no se cargaba su perfil) y, al mostrarse su membresía, un botón «Finalizar» que no le corresponde.
- Editar un miembro **sin correo** fallaba (`email must match format`): el formulario manda los campos vacíos y el esquema no admitía vacío. Ahora vacío = dato ausente (`NULL`, no cadena vacía) y se puede quitar.
- El miembro no podía rectificar sus datos de contacto desde el portal (derecho de rectificación): se agregó «Actualizar mis datos de contacto» en su resumen.
- Pantalla de carga con el logo (`#bootSplash`) y guía de uso de íconos: [`APP_ICONS.md`](APP_ICONS.md).

### Esquemas estrictos y avisos de reserva (11/10/2026)

- **Hallazgo de seguridad:** la matriz documentaba que «la validación de esquema rechaza propiedades desconocidas», pero Fastify, por defecto, las **elimina en silencio** (`removeAdditional: true`): un login con `role: "admin"` de más devolvía `401` de credenciales, no `400`. Era inofensivo (los handlers sólo leen campos conocidos) pero no era lo documentado ni una defensa real contra la asignación masiva. Ahora el servidor usa `removeAdditional: false` y rechaza con `400`; `strict-schemas.test.ts` lo sostiene y además exige que todo objeto de todo esquema de cuerpo declare `additionalProperties: false`.
- **Avisos de ausencia y llegada tarde** (migración `0007`): ver el modelo de datos. Son informativos y no tienen ningún efecto económico.

- **Dependencias:** `npm audit` (con y sin dependencias de desarrollo) da 0 vulnerabilidades en el servidor al 11/10/2026.

### Protección de datos personales (11/10/2026)

- **Exportación** de los datos de un miembro (acceso y portabilidad): el propio miembro desde «Resumen → Descargar mis datos», o administración desde «Miembros → Exportar datos»; sólo lo del titular, sin hashes de contraseñas, auditada sin su contenido.
- **Supresión por anonimización** (migración `0008`): borra la identidad (nombre, contacto, DNI, notas, correo y contraseña de la cuenta) de quien dejó el gimnasio y conserva movimientos de cuenta, membresías, reservas y asistencia sin identidad. Irreversible, transaccional, idempotente y auditada con su motivo; el perfil anonimizado no se puede volver a editar.
- `docs/DATA_PROTECTION.md`: inventario de datos, finalidades, consentimiento (texto sugerido), derechos y plazos (Ley 25.326), conservación y respaldos, encargados e incidentes, con la lista de lo que todavía requiere revisión legal.

### Revisión de seguridad dirigida (11/10/2026)

Revisión propia —**no sustituye a la auditoría independiente** de la Fase 3— de los puntos habituales del backend:

- **SQL:** todas las consultas son parametrizadas; lo único interpolado es una constante propia (`TEMPLATE_SELECT`).
- **Autenticación:** tiempos igualados entre usuario inexistente y contraseña incorrecta (hash ficticio), mensaje genérico, límite de intentos compartido en PostgreSQL, tokens de sesión de 256 bits guardados sólo como hash, cookie `HttpOnly; Secure; SameSite=Strict`, CSRF derivado de la sesión con comparación en tiempo constante. Sin hallazgos.
- **Hallazgo corregido:** el costo de scrypt era N=2¹⁴, p=1, por debajo del mínimo recomendado por OWASP. Ahora es N=2¹⁶, p=2, con los parámetros dentro del hash (una contraseña vieja sigue valiendo y se actualiza al iniciar sesión), una lista cerrada de parámetros aceptables (un hash hostil no puede agotar la memoria) y `mem_limit` en el contenedor.
- **Hallazgo corregido:** los esquemas descartaban en silencio los campos desconocidos en vez de rechazarlos (ver arriba).
- **Dependencias:** `npm audit` sin vulnerabilidades.


### Fase 6 en Chrome Android y limpieza del portal (11/10/2026)

- **Entorno de prueba:** emulador de `~/Android` (AVD `ikigai_phone`) con `adb reverse` de los puertos 8000 y 3001 y Playwright conectado por CDP al Chrome del dispositivo. Nota: el disco del proyecto es NTFS (`fuseblk`) y no deja ejecutar binarios de `node_modules`, así que la API de desarrollo corre desde una copia en `~/src/ikigai-run/server` (rsync del código, `npm ci` allí).
- **Hallazgos corregidos:** el texto de desarrollo «configurá la URL local en `?apiBase=…`» y «PORTAL EN DESARROLLO · URL de la API» eran visibles para cualquier usuario; ahora solo se muestran en `localhost`. `portal.html` pasó a `lang="es-AR"` con `notranslate` (Chrome ofrecía traducir la página). Caché del shell `ikigai-shell-v16`.
- **Resultado en Chrome Android:** 0 fallos (instalación/manifiesto, service worker, texto ampliado, teclado virtual, sin conexión, actualización de caché). `audit-mobile.py` sigue en 0 incumplimientos y `e2e-pwa.py` pasa.
- **Sigue pendiente:** los dos dispositivos físicos y la instalación real como app. El límite de intentos de login (429) protege también las corridas de prueba: tras ~5 logins seguidos hay que vaciar `rate_limit_buckets` de la base de desarrollo.


### Revisión adversarial de seguridad (11/10/2026)

Un agente de IA sin contexto previo leyó todo `server/src`, el portal, el service worker y `deploy/`, y atacó la API local con cuentas de administración, dos miembros y dos profesores. **Sin hallazgos críticos ni altos**: ningún acceso cruzado entre miembros, profesores y administración, sin escalada de privilegios (los esquemas rechazan campos de más), sin inyección SQL, sin XSS (las ~230 interpolaciones del portal escapan) y el service worker no cachea datos de usuario. Idempotencia del libro de cuentas y reservas concurrentes comprobadas con solicitudes simultáneas.

**Corregido, con prueba (`test/hardening.integration.test.ts`, 107/107 tests del servidor en verde):**

| Hallazgo | Corrección |
| --- | --- |
| M1 · el límite de intentos era solo por IP y contaba los logins exitosos (la WiFi del gimnasio, con una sola IP pública, se bloquearía sola; y quien probaba claves desde muchas IPs no tenía tope) | Tope **por cuenta** (10 fallos en 15 min, con HMAC del usuario, también para cuentas inexistentes para no revelar cuáles existen; se limpia al ingresar bien); límite por IP subido a 20/min; IPv6 agrupadas por /64 |
| M2 · el `scrypt` (64 MiB, 0,3 s) se ejecutaba antes de validar el token de reseteo/invitación: un anónimo podía agotar CPU y memoria | Se valida el token antes de hashear la clave |
| B1 · `/auth/%6cogin` llegaba al login sin pasar por el limitador compartido | La ruta se decodifica antes de elegir la política |
| B2 · el nombre de usuario quedaba en la auditoría de un miembro anonimizado | Ya no se guarda (queda el `userId`); el texto libre del motivo y de las descripciones del libro sigue siendo riesgo aceptado y documentado en `DATA_PROTECTION.md` |
| B3 · cualquier clave de 12 caracteres valía («aaaaaaaaaaaa») | Rechazo de claves obvias (pocos caracteres distintos, secuencias, lista corta común, igual a la cuenta) sin dependencias |
| B4 · `demo.html` y `app.js` (HTML armado con datos locales) se publicaban en el mismo origen de la sesión | Ya no entran a la imagen web |
| B6 · al cerrar sesión el DOM conservaba la clave temporal recién creada y las tablas | Se vacían la pantalla y el estado en memoria |
| S1 · el evento «noop» del reseteo llevaba el correo escrito por un anónimo hacia el adaptador (posible relevo de correo) | El evento ya no lleva destinatario |
| Informativos | `OPTIONS` de un origen ajeno daba 500 (ahora responde sin cabeceras CORS); `class-sessions` con año 0000 daba 500 (ahora 400, años 2000–2100) |
| Producción | `tour.js` faltaba en la imagen web: el service worker no se instalaba. `scripts/check-deploy-files.py` lo detecta |

**Pendiente (decisión de Marcos o infraestructura):**

- ~~S2 · cuentas que se van~~ **Resuelto (11/10/2026):** «Accesos» tiene «Deshabilitar acceso» / «Habilitar acceso» (estado `suspended`, migración `0011`; sesiones cerradas al instante; sin anonimizar). Un profesor con `active = false` en su perfil sigue siendo independiente del acceso: para sacarle el login se usa este botón.
- ~~S3 · reglas de reserva~~ **Resuelto (11/10/2026), decisión tomada con el criterio de una sola regla en todos los caminos:** toman lugar `trial` y `active`; `debtor`, `suspended` y `exited` no (reserva propia, turnos fijos y promoción de la lista de espera, que se salta a quien no es elegible sin sacarlo de la lista). No se exige membresía vigente. Los pagos sin tope siguen siendo intencionales (saldos a favor). Ver `DATA_MODEL.md`.
- ~~Exportación con notas internas~~ **Decidido:** se mantiene tal cual (las notas no contienen opiniones sobre terceros).
- **B5 · rol de base de datos.** La API corre con el usuario dueño de la base, que puede desactivar los triggers que hacen inmutables el libro de cuentas y la auditoría. Separar un rol de migraciones y otro de ejecución sin `UPDATE/DELETE` sobre esas tablas (Fase 7).
- **Despliegue (Fase 7):** Caddy como root sin `read_only`/`cap_drop`; `migrate` recibe secretos que no usa; `Cache-Control: no-store` en `/api/*` como red de seguridad; `NODE_ENV` queda en `development` si se ejecuta fuera de Docker; las claves temporales no vencen (limitadas por intentos y por el cambio obligatorio).
- No evaluado: Caddy y compose en ejecución, CVE de dependencias, el adaptador de correo real, XSS en navegador con cargas sembradas.


### Entrega y primer uso (11/10/2026)

- **Carga de datos reales sin tipear:** `tools/datos/` con la planilla Excel para el gimnasio (con desplegables y validaciones), un importador que valida todo antes de escribir, se apoya en la API (todo queda auditado), es repetible sin duplicar y puede **crear los accesos de todos y armar una hoja imprimible con una tarjeta por persona**. Probado de punta a punta contra la API real (16 miembros, 3 profesores, 16 horarios, 48 clases, 18 accesos; la segunda corrida no duplica). Dependencias (`openpyxl 3.1.5`, `defusedxml 0.7.1`) auditadas y aisladas de la API.
- **Instructivo ilustrado** (`docs/instructivo/`, HTML y PDF): guía de administración con el capítulo de Accesos paso a paso (crear, entregar, restablecer, deshabilitar/habilitar) y hojas para profesores y miembros. Las 39 capturas salen de la app real y se regeneran con `tools/instructivo/`.
- **Pulido de la interfaz hallado al preparar el instructivo:** en notebook, «Accesos» cortaba los botones «Restablecer clave» y «Deshabilitar acceso» y «Resumen» cortaba columnas (las dos columnas ahora se apilan si no entran con 560 px cada una); se quitaron textos técnicos que veía cualquier usuario («cuenta real de la API», «Cookie HttpOnly · CSRF», «guardan en PostgreSQL», «localStorage de la demo», «portal conectado»); la pantalla de ingreso habla de la persona y no del sistema; usuario y clave temporal se muestran grandes y se seleccionan de un toque.
- **Para el dueño:** cuestionario de puesta en marcha y hoja de costos en pesos (`docs/entrega/`), con el mensaje listo para WhatsApp. Lista de control completa en [`ENTREGA.md`](ENTREGA.md).
- **Pendiente:** dominio y servidor definitivos (Fase 7), planilla y cuestionario respondidos por el dueño, revisión jurídica (Fase 8), prueba en dos teléfonos Android reales y auditoría de seguridad externa humana.
