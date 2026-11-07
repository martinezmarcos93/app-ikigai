# Auditoría de Iron Pixel V2 — 2026-11-06

## Alcance
Revisión de updates/iron-pixel-v2.html para decidir qué falta antes de montarlo como vista game en el portal. No se modificó el HTML. Se leyeron updates/README.md, updates/iron-pixel-v2/ROADMAP.md, updates/iron-pixel-v2/AUDITORIA_BUGS.md (AUD-01 a AUD-33), portal.html y server/src/domain/game.ts.

## Defectos

### Verificado ejecutando
El auditor estático encontró 1 script inline sintácticamente válido, 34 ids declarados (sin duplicados) y 33 referencias a ids que existen. No encontró fallos estáticos.

Se intentó abrir el archivo con Chrome. El binario existe (/usr/bin/google-chrome), pero el entorno impidió su arranque; no se pudo inspeccionar la consola del navegador ni confirmar renderizado.

Comando ejecutado:
    google-chrome --headless=new --no-sandbox --disable-gpu --enable-logging=stderr --v=0 --user-data-dir=/tmp/iron-pixel-audit-profile-2 --dump-dom file:///home/marcos/src/ikigai-iron-pixel-auditoria-codex/updates/iron-pixel-v2.html

Salida relevante: setsockopt: Operation not permitted (1) de Crashpad; proceso terminó con código 133 y no produjo DOM. El intento sin --no-sandbox también fue bloqueado al crear el perfil. No se afirma que el HTML haya sido probado en Chrome.

### Visto leyendo el código
No se identificaron defectos funcionales nuevos atribuibles al HTML sin ejecutarlo. Los 37 falsos positivos del reporte anterior eran strings de color que contenían #; el auditor corregido no los detecta. No se repiten AUD-01 a AUD-33, que el historial marca corregidos o verificados.

## Puntos de integración

- **Persistencia local:** lee/escribe localStorage["ikigai.ironPixel.v2.records"] (HTML:782, HTML:796). Al integrarse, el récord debe usar el flujo del portal/API.
- **Récords e iniciales:** finish() añade al top 10 local puntuación, fecha, reps y nombre de hasta tres caracteres (HTML:1213, HTML:1224, HTML:1231); el listener normaliza iniciales (HTML:1868). El servidor juzga duración/reps/perfects y no confía en nombre ni puntaje del cliente.
- **Estilos globales:** modifica :root, *, body, html, button y canvas (HTML:10, HTML:21, HTML:24, HTML:125; html en HTML:397; universal responsivo en HTML:511). El portal inserta la vista bajo #pageContent (portal.html:89); los estilos deben limitarse al contenedor.
- **Ids:** no hay colisiones literales con portal.html. Entre los 34 ids están screen, overlay, startBtn, score, reps, time, actionBtn, settings y leaderboard. Mantenerlos namespaced al componer la vista.
- **Listeners sin desmontaje:** botones en HTML:1770, HTML:1779, HTML:1785, HTML:1800, HTML:1803, HTML:1806, HTML:1815, HTML:1816, HTML:1817, HTML:1868; document en HTML:1790, HTML:1794, HTML:1833, HTML:1840; window en HTML:1797, HTML:1898; canvas en HTML:1820. No hay teardown al salir de la vista game.
- **Animación:** RAF se agenda continuamente (HTML:1768) y arranca al cargar (HTML:1905). Se guarda raf, pero no se llama cancelAnimationFrame; cancelar el bucle al desmontar la vista.
- **Audio:** AudioContext reutilizable (HTML:812); cada oscilador se detiene al terminar el efecto (HTML:814-HTML:824). No se encontró música en loop. No se cierra el contexto al salir de la vista.

## Contrato con el servidor

server/src/domain/game.ts exige elapsedMs >= MIN_RUN_MS (29.000 ms), hasta MAX_RUN_MS (10 minutos), reps enteras de 0 a MAX_REPS (100), y perfectReps de 0 a min(reps, MAX_PERFECT_REPS=32). Puntúa 10 por repetición y 10 extra por perfecta. El HTML no llama API ni crea objeto de envío: conserva score, reps y perfects localmente.

El circuito son cuatro pruebas EX_SECONDS=30 y tres transiciones TRANSITION_SECONDS=5: **135 segundos totales** (HTML:722-HTML:723, transiciones HTML:1172-HTML:1175). Supera la duración de juego de 30 s, aunque queda bajo MAX_RUN_MS; el validador de duración no lo rechazaría por sí solo.

Al terminar, produce score, reps, perfects agregado y repsBy por ejercicio; no guarda perfectsBy. README registra resultados observados en pruebas perfectas de 20 s: press 31, dominadas 16, curl 19, bicicleta 15. No son máximos matemáticos ni predicen los resultados a 30 s. El servidor aplica topes globales de 100 reps y 32 perfectas; al sumar cuatro pruebas se pueden rebasar, así que los agregados del circuito pueden ser rechazados. El máximo aceptable de puntuación según esos topes es 1.320 (100×10 + 32×10).

**Zen:** sin temporizador, avanza manualmente por el circuito, suma reps/puntaje local y limita puntaje a 500; finish() lo trata como práctica y no lo registra (HTML:991, HTML:1183, HTML:1220-HTML:1224). No corresponde a una run productiva de 30 s.

**Prueba suelta:** dura hasta 30 s, pero también es práctica y no se registra (HTML:1183-HTML:1188, HTML:1220-HTML:1224). Su duración se acerca al mínimo del servidor, pero el juego no envía datos y reps/perfects pueden superar topes globales.

Para integrarlo, el portal debe gestionar inicio/finalización y medición de sesión con servidor, enviar los datos esperados y usar servidor como autoridad de validación/puntaje. No enviar Zen ni prueba suelta como recompensas y no confiar en localStorage.

## Severidad y criterio
El ROADMAP define P0 bloqueante, P1 alta, P2 media y P3 evolutiva. No asigno AUD-34+: no se confirmó un defecto nuevo del juego ejecutándolo. Los riesgos descritos son cambios de integración, no bugs demostrados del prototipo aislado.
