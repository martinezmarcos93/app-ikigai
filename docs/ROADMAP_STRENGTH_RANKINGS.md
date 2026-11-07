# Ikigai Training — roadmap de Ranking de Fuerza

## Objetivo

Incorporar una sección de Ranking visible para toda persona autenticada, con una clasificación independiente por ejercicio y edición exclusiva de administración.

## Decisiones funcionales

- Ocho ejercicios iniciales: Pecho plano, Pecho 45°, Dominadas, Sentadillas, Peso muerto, Despegue, Press militar e Hip thrust.
- Cada ejercicio tiene su propio ranking.
- La clasificación usa la mejor marca histórica registrada de cada miembro en ese ejercicio.
- Se muestran primero los tres primeros puestos y después la clasificación completa.
- Un miembro ve siempre su propia posición y marca.
- Administración puede abrir el perfil de cada miembro desde el ranking.
- Sólo administración puede registrar, corregir y eliminar marcas.
- Las marcas son históricas: corregir una marca no reemplaza silenciosamente el historial de auditoría.
- No existe un ranking global sumando kilos entre ejercicios.
- Perfiles anonimizados o dados de baja no aparecen en la clasificación.

## Fase 1 — Modelo y API
**Estado: implementada en esta rama.**

- [x] Migración 0015 con catálogo de ejercicios y marcas históricas.
- [x] Catálogo inicial con los ocho ejercicios definidos.
- [x] Endpoint para usuarios autenticados.
- [x] Posición propia calculada por el servidor.
- [x] CRUD administrativo protegido por rol, CSRF, transacción y auditoría.
- [x] Matriz de autorización y modelo de datos actualizados.

## Fase 2 — Portal y administración
**Estado: implementada en esta rama.**

- [x] Nueva entrada "Ranking" visible sin filtro de rol.
- [x] Selector de ejercicio.
- [x] Podio de tres primeros.
- [x] Clasificación completa.
- [x] Tarjeta de posición propia.
- [x] Acceso al perfil de miembro para administración.
- [x] Formulario para registrar marcas.
- [x] Historial administrativo con corrección y eliminación.

## Fase 3 — Datos existentes
**Estado: pendiente.**

- [ ] Definir si el Excel registro_gimnasio.xlsx es una carga inicial autorizada para la base real.
- [ ] Resolver correspondencia entre los nombres del Excel y los member_profiles.id.
- [ ] Importar únicamente las celdas numéricas como kg; "-" significa ausencia de marca.
- [ ] Registrar fecha y autor de importación de forma explícita.
- [ ] No incorporar nombres del Excel como datos semilla del repositorio.

## Fase 4 — Validación
**Estado: pendiente de ejecución.**

- [ ] Test de integración PostgreSQL para lectura del ranking.
- [ ] Verificar que miembro y profesor puedan leer.
- [ ] Verificar que miembro/profesor no puedan escribir.
- [ ] Verificar CRUD administrativo y auditoría.
- [ ] Verificar que la eliminación de la mejor marca haga subir la siguiente mejor marca.
- [ ] Validar visualmente en navegador, especialmente móvil.
- [ ] Validar empates y posiciones deterministas.
