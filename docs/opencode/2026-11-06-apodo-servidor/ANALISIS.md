# Análisis: Apodo de ranking por miembro

## Situación actual
- El ranking de fuerza (`strength-rankings.integration.test.ts` / `strength-rankings.ts`) no maneja apodos.
- Actualmente se muestra el nombre real (o una versión anonimizada en el portal, según la lógica actual).

## Hallazgos
- `server/migrations/0015_strength_rankings.sql` existe.
- Los tests actuales ya cubren el acceso de diferentes roles al ranking de fuerza.
- Las rutas del servidor (`server/src/routes/`) son el lugar principal de implementación.

## Plan de trabajo
1. Migración SQL.
2. Implementar rutas en `server/src/routes/strength-rankings.ts`.
3. Implementar cambios en `server/src/routes/game.ts`.
4. Implementar cambios en `server/src/routes/data-protection.ts`.
5. Tests y documentación.
