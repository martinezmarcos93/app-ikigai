# Análisis — Encargo 008 (Apodo de ranking)

- **Contexto**: El encargo busca implementar apodos para los rankings de fuerza (y eventualmente Iron Pixel), asegurando anonimización y privacidad (nombre real solo para admins).
- **Estado Actual**:
    - Migración SQL realizada en la ronda 1.
    - Tests de integración fallando (`ranking-alias.integration.test.ts`, `strength-rankings.integration.test.ts`) y falla de documentación en `route-security.test.ts`.
- **Análisis**:
    - `ranking-alias.integration.test.ts` falla en aserción de apodo: probablemente no se está guardando o recuperando correctamente.
    - `strength-rankings.integration.test.ts` falla con 400 en vez de 201: likely el esquema de la ruta requiere el apodo que no está siendo enviado en ese test.
    - `route-security.test.ts` falla: las rutas nuevas (`/api/v1/admin/strength-aliases`) existen pero no están en la matriz de seguridad (`docs/SECURITY_ROUTE_MATRIX.md`).
- **Plan**: Seguir las tareas del encargo en orden, comenzando por las rutas y terminando por docs y anonimización, asegurando cada commit pasa el oráculo (todos los tests).
- **Convenciones**: Uso de `btrim` (en SQL), `trim()` (JS), validación post-trimming.

# Roadmap

| ID | Tarea | Complejidad | Archivos | Verificación | Estado |
|----|-------|-------------|----------|--------------|--------|
| 1 | Corregir rutas y validaciones (Tarea 2) | 4 | `server/src/routes/strength-rankings.ts` | `npm test` | pendiente |
| 2 | Ajustar `server/src/routes/game.ts` (Tarea 3) | 2 | `server/src/routes/game.ts` | `npm test` | pendiente |
| 3 | Implementar anonimización (Tarea 4) | 3 | `server/src/routes/data-protection.ts` | `npm test` | pendiente |
| 4 | Corregir/Implementar Tests (Tarea 5) | 3 | `server/test/ranking-alias.integration.test.ts`, `server/test/strength-rankings.integration.test.ts` | `npm test` | pendiente |
| 5 | Actualizar Docs (Tarea 6) | 1 | `docs/SECURITY_ROUTE_MATRIX.md`, `docs/DATA_MODEL.md`, `server/README.md` | `npm test` | pendiente |
