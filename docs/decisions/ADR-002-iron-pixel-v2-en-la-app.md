# ADR-002 — Iron Pixel V2 reemplaza al juego integrado

- **Fecha:** 2026-11-06
- **Estado:** aceptado (decisiones de producto de Marcos; diseño técnico de Claude)
- **Rama:** `feat/iron-pixel-v2-integracion`

## Contexto
Iron Pixel V1 (`iron-pixel.js`) es una partida de 30 s con un solo gesto. El servidor (`server/src/domain/game.ts`) recibe `reps` y `perfectReps`, valida duración y topes calibrados para esa mecánica (`MIN_RUN_MS` 29 s, `MAX_REPS` 100, `MAX_PERFECT_REPS` 32) y decide puntaje y puntos canjeables.

Iron Pixel V2 (`updates/iron-pixel-v2.html`) es un circuito de 4 pruebas de 30 s con 3 transiciones de 5 s (135 s), clasificación PERFECT/GOOD/FLOJO, peso con multiplicador y combos. Está aislado: guarda récords en `localStorage` y no habla con el servidor. Auditoría: `updates/iron-pixel-v2/AUDITORIA_2026-11-06.md`. En una prueba de humo, un bot que toca a ciegas hizo 115 reps y 30 perfectas, así que el servidor actual rechazaría circuitos legítimos.

## Decisiones de producto (Marcos, 2026-11-06)
1. El V2 **reemplaza** al V1 en la sección Iron Pixel.
2. **Suma puntos el circuito completo**; el servidor extiende la duración aceptada. Zen y prueba suelta son práctica: no llaman al servidor ni suman.
3. En el ranking de Iron Pixel se muestra el **apodo** del miembro si lo tiene (ver ranking de fuerza); si no, nombre + inicial como hoy.

## Decisiones técnicas
- **El servidor sigue siendo la autoridad.** El navegador informa conteos; el puntaje oficial lo calcula el servidor.
- **Contrato v2 de cierre** (`POST /api/v1/game/runs/:id/finish`):
  `{ version: 2, weight: "light"|"medium"|"heavy", exercises: { bench, pull, curl, bike } }`, con cada ejercicio `{ perfect, good, flojo }` (enteros ≥ 0). Los cuatro son obligatorios.
  Un cierre con el cuerpo v1 (`reps`, `perfectReps`) responde `409 outdated_client`, para que un celular con la versión vieja en caché recargue.
- **Validación v2** (`judgeRunV2`): duración ≥ 133 s (135 s menos 2 s de margen por el reloj del teléfono) y ≤ `MAX_RUN_MS`. Por ejercicio, el total y las perfectas tienen techos **derivados de los frenos de ritmo del propio juego** (tiempo mínimo entre toques, ventanas de PERFECT). La fórmula se documenta junto a cada constante.
- **Puntaje oficial** = Σ por ejercicio (perfect·25 + good·10 + flojo·2) × multiplicador de peso (1 / 1,5 / 2), redondeado hacia abajo. **Sin combos**, porque el servidor no puede verificar la secuencia. En el juego el combo queda como racha visual y el puntaje que se muestra al terminar es el oficial que devuelve el servidor.
- **Puntos canjeables:** igual que hoy, `pointsForRun(score, ganadoHoy, topeDiario)`. El tope diario configurable acota la economía aunque los puntajes del V2 sean más altos que los del V1.
- **Datos:** migración `0017_game_v2.sql` agrega a `game_runs` `game_version smallint NOT NULL DEFAULT 1` (1 o 2), `weight text` y `detail jsonb` con los conteos por ejercicio. Se amplían los CHECK de `reps`, `perfect_reps` y `score` si los nuevos máximos los superan. Las partidas viejas quedan como versión 1.
- **Ranking semanal:** solo cuenta partidas `game_version = 2`. La semana del cambio arranca de cero porque los puntajes no son comparables. Los puntos ya ganados se conservan.
- **Frontend:** el HTML se convierte en `iron-pixel-v2.js` con `mount(contenedor)` y `unmount()`. `unmount()` cancela `requestAnimationFrame`, quita todos los listeners de `window` y `document`, y suspende el `AudioContext`. Los estilos quedan acotados bajo el prefijo `.ip2` y los ids con prefijo `ip2-`. Se eliminan la tabla local, las iniciales y `localStorage`: el ranking viene de `/game/summary`. Se borra `iron-pixel.js`.
- **Paridad:** un test verifica que las constantes de tiempo del juego (`EX_SECONDS`, `TRANSITION_SECONDS`, frenos de ritmo) coincidan con las del servidor.

## Consecuencias
- Cambio de contrato: después del deploy, los clientes viejos reciben `outdated_client` hasta recargar.
- El ranking semanal se reinicia la semana del despliegue.
- `updates/` sigue siendo material de referencia. El código vivo queda en la raíz, junto a `portal.js`.

## Etapas
1. Servidor: migración, `judgeRunV2`, cierre v2, ranking con apodo y versión, tests de integración.
2. Portal: `iron-pixel-v2.js` montable, CSS acotado, `api-client.js` y vista `game`; se quita el V1.
3. Verificación de Claude: Chrome de escritorio y celular, recorrido completo con la API real, mutación de los topes.
