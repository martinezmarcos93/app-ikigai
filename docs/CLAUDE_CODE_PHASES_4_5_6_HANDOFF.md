# Handoff ejecutable para Claude Code — Fases 4, 5 y 6

**Repositorio:** `martinezmarcos93/app-ikigai`  
**Rama base estable:** `main`  
**Barrido remoto actual:** `feat/phase-4-schedule-api-sweep`  
**Base funcional:** `main`; no integrar ramas antiguas divergentes completas.  
**Objetivo:** continuar en barridos amplios hasta agotar todo el trabajo que pueda resolverse sin acceso local, credenciales de terceros o validación en dispositivos físicos.  
**Regla de evidencia:** distinguir código implementado, pruebas ejecutadas, aceptación manual y bloqueos externos. No declarar una fase cerrada por tener documentación o tests escritos.

## Instrucción de ejecución

Claude Code debe inspeccionar el árbol y el estado real del repositorio antes de modificar. Mantener los cambios existentes de identidad de marca, tokens, logo, tipografías y paleta oscura/roja. Trabajar sobre esta rama o una rama nueva basada en el `main` actualizado. No reintroducir datos ficticios en el portal conectado ni usar `localStorage` para información autenticada. Implementar, ejecutar pruebas disponibles, reparar fallos y continuar hasta que el siguiente paso requiera explícitamente credenciales, infraestructura externa o dispositivo físico. Cada bloqueo debe incluir comando exacto, evidencia observada y acción requerida.

## Fase 4 — Integración completa portal/API

### Ya expuesto / disponible
- Cliente de API centralizado con cookies de sesión, CSRF en memoria, `cache: no-store`, normalización de errores e idempotencia para formularios financieros.
- Portal conectado con login, resumen por rol, miembros, servicios, membresías, cuenta corriente, profesores, invitaciones/accesos, ajustes institucionales, rutinas asignadas y lectura de historial de asistencia del miembro.
- En esta rama se añaden contratos para expiración de sesión, limpieza del estado al cerrar sesión aunque falle el servidor, errores no JSON, servicios, ajustes institucionales, creación/cancelación de reservas.
- El backend ya define rutas para miembros, membresías, cuenta corriente, obligaciones de profesores, invitaciones, rutinas, reservas y asistencia.

### Barrido de implementación
- [ ] Ejecutar y corregir todos los tests de cliente, frontend, backend, typecheck, build, migraciones y recursos PWA. No aceptar “pending” o un workflow sin jobs como prueba.
- [x] Implementado en la rama: dashboard de administración y resumen del miembro cargan recursos de forma independiente; fallos aislados muestran `No disponible`/mensaje por sección y un 401 sigue invalidando la sesión. **Pendiente de ejecutar los tests estáticos añadidos y validar en navegador.**
- [ ] Normalizar manejo visual de 401/403/404/409/422/429/5xx/red en todas las pantallas; evitar errores duplicados, mensajes técnicos crudos y éxito falso.
- [ ] Miembros: probar paginación completa, búsqueda/filtros, página vacía, error de carga, edición permitida, validación y actualización del total; verificar que no se pierda el offset ni se muestre dato viejo como actualizado.
- [ ] Servicios: alta/edición, estado activo/inactivo, importe nulo, valores límite y preservación de precios históricos en membresías/cargos anteriores.
- [ ] Membresías: historial, alta, cierre, vigencias, solapamientos/conflictos, selección correcta del miembro y ausencia de cargos automáticos implícitos.
- [ ] Cuenta corriente: débitos/créditos, pagos parciales, ajustes con motivo, saldo a favor, idempotencia de doble envío y conflicto al reutilizar clave con payload distinto; mantener libro mayor append-only.
- [ ] Profesores: obligación configurada/no configurada, pagos parciales y excesivos, ajustes, período consultado y separación entre reservas/asistencia y deuda económica.
- [ ] Accesos: crear/re-enviar/revocar invitación, mostrar token sólo cuando corresponde y una sola vez, no persistir token, resetear acceso, revocar sesiones y mostrar estado de entrega real sin fingir que el email fue enviado.
- [ ] Rutinas: catálogo de ejercicios, versiones inmutables, asignación, lectura por miembro, ausencia de asignaciones, referencias inválidas y control de permisos.
- [ ] Ajustes institucionales: carga, validación, guardado, feedback de éxito/error y no sobrescribir cambios locales con respuesta vieja.
- [ ] Revisar que las rutas del cliente coincidan exactamente con las rutas registradas en `server/src/app.ts` y los esquemas de respuesta reales. No inventar endpoint de agenda/listado de clases si no existe en backend.
- [ ] Completar contratos de API cliente para cada método público de escritura/lectura que se utilice desde UI, especialmente sesión, miembros, servicios, membresías, ledger, profesores, invitaciones, rutinas, reservas y asistencia.
- [ ] Verificar navegación por teclado, foco, etiquetas, estados `aria-live`, formularios largos, prevención de doble envío y feedback de carga.

### Pruebas requeridas para cerrar Fase 4
- [ ] Contratos API cliente ejecutados en CI verde.
- [ ] Pruebas por rol (admin, coach, member) con intentos permitidos y denegados en servidor.
- [ ] Prueba de dos miembros para comprobar aislamiento cruzado.
- [ ] Prueba de expiración de sesión, logout, CSRF y origen no permitido.
- [ ] Evidencia manual de todos los formularios y estados de error en navegador.
- [ ] Capturas o reporte de aceptación sin datos personales reales.

## Fase 5 — Operación del gimnasio: agenda, reservas, asistencia y finanzas

### Reservas / capacidad / lista de espera
- [ ] Inventariar el modelo de agenda existente en migraciones, dominio y backend. Distinguir plantillas de clase, instancias/turnos y reservas.
- [ ] Identificar explícitamente las rutas faltantes: lectura/listado de instancias, filtros por fecha/profesor/servicio, y operaciones administrativas para crear/editar/cancelar turnos. Implementarlas sólo si el modelo actual las soporta; no simularlas en frontend.
- [ ] Crear UI conectada para calendario/listado de turnos con fecha, horario, profesor, servicio, capacidad, confirmados y lista de espera.
- [ ] Crear UI de reserva del miembro y cancelación, consumiendo `createBooking` y `cancelBooking`; reflejar `confirmed` y `waitlist` como estados diferentes.
- [ ] Respetar en servidor el corte de 40 minutos, estados no reservables, membresía/miembro activo, duplicados, propiedad de reserva y permisos administrativos.
- [ ] Mostrar capacidad consumida únicamente por reservas confirmadas; espera no consume cupo.
- [ ] Cancelar confirmada promueve a la persona más antigua en espera, de forma transaccional y sólo antes del corte; cancelar en espera no debe provocar promoción innecesaria.
- [ ] Añadir pruebas de concurrencia sobre el último cupo, doble reserva, cancelación repetida, corte temporal, errores de transacción y orden FIFO de lista de espera.
- [ ] Agregar filtros accesibles y comportamiento móvil para agenda sin scroll horizontal global.

### Asistencia
- [ ] Conectar pantalla de profesor/admin a `GET/PUT /api/v1/class-sessions/:id/attendance`.
- [ ] Permitir seleccionar una clase/instancia, ver reservas confirmadas, marcar presente/ausente y corregir una marca existente.
- [ ] Guardar lotes de asistencia con feedback por resultado; al volver a abrir, recuperar datos del servidor.
- [ ] Evitar duplicados, permitir sólo reservas confirmadas y rechazar instancias canceladas.
- [ ] Probar idempotencia funcional, auditoría atómica, coach asignado versus no asignado, member sin permisos y correcciones.
- [ ] El historial personal del miembro sólo puede mostrar su propio registro.

### Operación financiera y obligaciones
- [ ] Ejecutar pruebas de saldo derivado del libro mayor; no almacenar un total mutable como fuente de verdad.
- [ ] Comprobar historial inmutable, clave de idempotencia, reintento seguro, pagos parciales, reintegros, ajustes y saldos a favor.
- [ ] Comprobar obligación mensual fija de profesor, pagos parciales/excesivos y ajustes firmados; un período no configurado debe tener saldo `null`, no cero ficticio.
- [ ] No incorporar multas automáticas ni porcentajes de ingresos por profesor. No convertir comprobantes internos en facturas fiscales.
- [ ] Auditar cambios sensibles con metadatos mínimos y sin copiar DNI/contactos/datos financieros completos al payload de auditoría.

### Cierre de Fase 5
- [ ] Todas las reglas anteriores tienen tests de integración de servidor con PostgreSQL descartable.
- [x] API de lectura de agenda añadida en `GET /api/v1/class-sessions`, con ventana temporal acotada, paginación, rol autenticado y alcance de profesor; el contrato del cliente incorpora validación de fechas/paginación y `cache: no-store`. **Pendiente ejecutar CI e integración PostgreSQL.**
- [x] Vista de agenda conectada al cliente real: lectura de clases, reservas/cancelaciones y toma de asistencia para administración/profesor; la asistencia se guarda en el backend auditado. **Pendiente ejecutar CI, probar por rol y validar errores/cupo en navegador.**
- [ ] UI para crear/editar plantillas y generar instancias de clases; el portal consume las instancias existentes, pero no las administra.
- [ ] Pruebas de concurrencia y autorización aprobadas.
- [ ] Flujos críticos probados con usuarios ficticios de cada rol.

## Fase 6 — PWA y UX móvil Android

### Implementación técnica
- [ ] Ejecutar validación de manifest, iconos, shell, service worker y rutas locales; resolver todos los paths rotos.
- [x] Añadida exclusión por segmento `/api` al service worker, también cuando la aplicación está bajo una subruta; la regla evita cachear cualquier URL del mismo origen cuyo path contenga el segmento `api`. Se incrementó la versión de caché a `ikigai-shell-v7` para invalidar el caché previo y retirar entradas que pudieran haberse almacenado bajo rutas API anidadas. **Pendiente ejecutar las pruebas estáticas y probar el service worker en navegador.**
- [ ] Revisar estrategia de actualización de caché y recuperación offline: informar claramente que una operación no se pudo sincronizar; no poner en cola operaciones financieras/reservas de forma implícita.
- [ ] Añadir feedback de conectividad y un estado offline que no presente información cacheada como datos actuales del servidor.
- [ ] Revisar actualización de sesión tras volver de background, cierre de sesión, expiración y cambio de usuario en un mismo dispositivo.
- [ ] Añadir estados de carga, vacío, error y permisos consistentes; reducir saltos de layout y bloquear doble envío durante escrituras.
- [ ] Revisar accesibilidad WCAG práctica: contraste, foco visible, labels, orden de tabulación, nombres accesibles para iconos, mensajes anunciados, objetivos táctiles y respeto a `prefers-reduced-motion`.
- [ ] Revisar layouts a 320, 360, 390, 412, 480 y tablet; tablas con scroll interno, formularios/modales con scroll interno y teclado virtual sin ocultar el botón principal.
- [ ] Revisar menú móvil: apertura/cierre por botón, navegación, Escape y toque fuera, con `aria-expanded` correcto.
- [ ] Conservar logo, paleta, tipografías y tokens actuales. Cambios de marca requieren revisión explícita; no reemplazar el logo por iniciales ni eliminar el fondo negro automáticamente.
- [ ] Mantener la demo local claramente separada: no registrarla como PWA conectada y no mezclar su `localStorage` con el portal real.

### Validación física (bloqueo externo)
- [ ] Emular viewport y ejecutar pruebas automáticas de rutas/assets.
- [ ] Probar instalación y actualización en Chrome Android real.
- [ ] Probar al menos un dispositivo de gama baja y uno de gama media/alta: login, formularios, teclado, navegación, conexión intermitente, retorno desde background, logout y expiración.
- [ ] Registrar modelo/versión de Android/Chrome, resolución, pasos, resultado y defectos; no declarar “validado en Android” sólo por emulación.

## Seguridad / preproducción: gates transversales que siguen abiertos

- [ ] Resolver la falla externa de asignación de runner en GitHub Actions; confirmar un run real con jobs/steps ejecutados y resultado verde.
- [ ] Revisar cobertura completa de autorización negativa y aislamiento entre miembros/profesores. La lectura de agenda deniega explícitamente a un rol profesor sin perfil vinculado.
- [ ] Obtener revisión de seguridad independiente y resolver hallazgos.
- [ ] Ejecutar backup/restore en PostgreSQL descartable y conservar evidencia del resultado.
- [ ] Definir y verificar política del proveedor de producción: frecuencia, retención, cifrado, permisos, alertas, RPO/RTO y prueba periódica de restauración.
- [ ] Configurar y probar proveedor de entrega de recuperación de contraseña/invitaciones, dominio y URL de producción; verificar que tokens no aparezcan en logs ni query string.
- [ ] Confirmar límites de rate limiting compartidos si hay múltiples instancias, secretos por entorno, CORS/orígenes y HTTPS.
- [ ] No cargar datos reales hasta que las puertas de seguridad y operación estén aprobadas.

## Comandos locales para Claude Code

Primero inspeccionar scripts reales en los `package.json` raíz y de `server/`; luego ejecutar los equivalentes presentes:
1. `node --check app.js`
2. `node --check api-client.js`
3. `node --check portal.js`
4. `node --check reset-password.js`
5. `node scripts/test-api-client.mjs`
6. `node scripts/test-first-run.mjs`
7. `npm ci` en `server/`
8. scripts de typecheck, test, build y migración definidos en `server/package.json`
9. `python scripts/validate-brand-assets.py`
10. Validación de aceptación manual y dispositivos descrita arriba.

No continuar usando un comando que no exista: informar el script real equivalente del repositorio. Si un comando falla, corregir el fallo y repetirlo antes de avanzar.

## Informe final esperado de Claude Code

Entregar tabla por fase con: cambios concretos/archivos, tests ejecutados y resultado, aceptación manual, bloqueos externos, riesgos abiertos y commit/PR. Clasificar cada punto como **implementado**, **automatizado y aprobado**, **validado manualmente**, o **bloqueado**. No usar “completo” si quedan gates abiertos.
