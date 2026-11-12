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

## Fase 2b — Apodo en el ranking
**Estado: implementada (2026-11-07).**

- [x] `member_profiles.ranking_alias` (migración 0016), único sin distinguir mayúsculas, 2 a 24 caracteres.
- [x] Administración lo escribe la primera vez que carga una marca; queda precargado y se puede editar.
- [x] Quien no es admin ve solo apodos: el servidor no envía `member_name` ni `member_id` ajenos.
- [x] El apodo también se muestra en el ranking de Iron Pixel; sin apodo, nombre + inicial.
- [x] La anonimización borra el apodo y las notas de las marcas.

## Fase 3 — Datos existentes
**Estado: correspondencia parcial; falta cargar.**

- [x] Correspondencia apodo del Excel → miembro real: 16 confirmados por el gimnasio, 8 a la espera. Los nombres viven fuera del repositorio.
- [ ] Cargar solo los 16 confirmados en la base real (lo hace Claude con acceso a producción y al Excel original `registro_gimnasio.xlsx`). No delegar: son datos de terceros.
- [ ] Dos de los confirmados son staff: verificar que tengan ficha de miembro antes de cargarles marcas.
- [ ] Importar únicamente las celdas numéricas como kg (Dominadas: repeticiones enteras); "-" significa ausencia de marca.
- [ ] Registrar fecha y autor de importación de forma explícita.
- [ ] No incorporar nombres del Excel como datos semilla del repositorio.

## Fase 4 — Validación
**Estado: hecha (2026-11-07), salvo empates.**

- [x] Test de integración PostgreSQL para lectura del ranking (`strength-rankings`, `ranking-alias`).
- [x] Miembro y profesor leen; miembro/profesor no escriben.
- [x] CRUD administrativo y auditoría.
- [x] La eliminación de la mejor marca hace subir la siguiente.
- [x] Validación visual en Chrome de escritorio (1366 px) y celular (390 px), como admin y como miembro.
- [x] Dominadas en repeticiones (2026-11-11, migración 0020): el servidor exige enteros de 1 a 1000 y el portal muestra «reps».
- [ ] Empates: hoy se ordenan por apodo (alfabético). Decidir si dos marcas iguales comparten puesto.
