# Iron Pixel V2 — Roadmap de estabilización y evolución

**Rama:** `fix/iron-pixel-v2-estabilizacion` (parte de `feat/iron-pixel-v2-prototype`)  
**Estado general:** prototipo experimental; no apto para integración ni publicación como versión estable.  
**Prioridad actual:** corregir y verificar la experiencia visual antes de sumar mecánicas nuevas.

## Objetivo

Convertir el prototipo aislado de Iron Pixel V2 en un minijuego arcade de entrenamiento consistente, legible y entretenido. El circuito combinará pruebas breves con reglas distintas, feedback visual y sonoro, dificultad progresiva y controles utilizables con teclado, ratón y pantalla táctil.

El prototipo continúa aislado de la lógica productiva de Ikigai Training. No modificar `main`, `iron-pixel.js`, la API, las migraciones ni la economía de puntos durante estas fases.

## Estado y criterio de trabajo

La última revisión estática de JavaScript no equivale a una validación funcional en navegador. Se informó que las visuales siguen rotas en la versión descargada; por lo tanto, el parche de animación de bicicleta no debe considerarse una solución verificada. No sumar mecánicas ni declarar una fase terminada sin probar el HTML real en navegador y registrar el resultado.

## Actualización 2026-10-27

Se intentó reproducir el fallo visual en Chromium headless (escritorio y emulación móvil) y **no se reprodujo**: la página carga sin errores de consola y las cuatro pruebas se dibujan completas. Se corrigieron en cambio defectos visuales y de jugabilidad confirmados (ver AUD-11 a AUD-17 en la auditoría). La validación fue automatizada; sigue pendiente la prueba manual en navegadores y dispositivos reales, y no se probó Firefox ni Safari.

Estado por fase tras esa actualización: Fase 0 y Fase 1 parciales (sin reproducción del fallo, auditoría de canvas y estados hecha por código y simulación); Fase 2 con los cuatro ciclos de puntuación revisados y corregidos en simulación, a la espera de prueba manual; Fases 3 a 6 sin empezar.

### Segunda pasada 2026-10-27: Chrome real

Se jugó en Chrome de escritorio real y en marcos de celular, con clicks y con un bot en tiempo real. Se corrigieron AUD-18 a AUD-27: avisos invisibles que movían la página, ajustes que no respondían, curl que no se mantenía, press con tiempo muerto, controles duplicados, press dibujado igual que el curl, panel y transición engañosos y desborde en 360 px. Las casillas de abajo reflejan lo verificado; lo que depende de una persona jugando en un dispositivo real queda sin marcar.

## Fases

### Fase 0 — Congelar y establecer una línea base
**Estado: completa, salvo capturas guardadas en el repo.**

- [x] Confirmar que todo el trabajo se realiza en esta rama y que `main` no cambia.
- [x] Registrar commit y versión exacta del HTML probado.
- [x] Reproducir el fallo visual desde una copia limpia del archivo. (No se reprodujo ni en Chromium headless ni en Chrome real.)
- [x] Probar en un navegador de escritorio y, luego, en móvil. (Móvil: marcos de 390 y 360 px; falta un teléfono real.)
- [ ] Capturar evidencia de cada pantalla: inicio, cada ejercicio, transiciones, resultado y modo Zen.
- [x] Distinguir errores de renderizado, animación, escala del canvas, estado de juego y controles.

**Criterio de salida:** el fallo visual está reproducido, documentado y asociado a un caso concreto. Si no se reproduce, registrar navegador, pasos y diferencias con la versión descargada.

### Fase 1 — Auditoría visual y funcional
**Estado: completa en Chrome; falta Firefox/Safari.**

- [x] Revisar tamaño real del canvas, relación de aspecto, escalado HiDPI y `image-rendering`.
- [x] Revisar coordenadas de dibujo, orden de capas, limpieza de frames y estados de animación.
- [x] Verificar que cada sprite/figura se dibuje dentro del área visible y no quede tapado por HUD u overlays.
- [x] Revisar coherencia entre estado lógico del ejercicio y pose dibujada.
- [x] Verificar redimensionado, proporciones y controles táctiles. (Táctil simulado con eventos de puntero.)
- [x] Comprobar errores de consola y fallos de carga.
- [x] Crear una lista de defectos con severidad, pasos para reproducir y criterio de aceptación.

**Criterio de salida:** todas las pantallas se renderizan de forma coherente; los defectos críticos tienen corrección y prueba reproducible.

### Fase 2 — Corregir animaciones y ciclos de puntuación existentes
**Estado: completa con bot en tiempo real; falta la prueba manual de una persona.**

- [x] **Bicicleta:** confirmar alternancia izquierda/derecha, fase visual continua y coincidencia entre pedaleo y giro de ruedas; una entrada inválida no debe consumir turno ni corromper el ciclo.
- [x] **Dominadas:** validar ciclo completo de subida y bajada; evitar sumar repeticiones por pulsaciones repetidas o fases incompletas.
- [x] **Press de banca:** validar recorrido completo del indicador/barra y que la puntuación se otorgue una sola vez por ciclo.
- [x] **Curl de bíceps:** comprobar mantener/soltar, límite de duración y feedback de puntuación.
- [x] Verificar temporizadores, pausas, transiciones, reinicio y finalización.
- [x] Probar que el orden aleatorio no omita ni duplique ejercicios.
- [ ] Comprobar puntuación, combo, dificultad y selección de peso. (Puntuación y combo verificados; el balance entre pruebas pasa a la Fase 5.)

**Criterio de salida:** cada ejercicio tiene un ciclo claramente observable, una regla de puntuación entendible y pruebas manuales registradas.

### Fase 3 — Rediseñar la experiencia como circuito arcade
**Estado: propuesta; empezar después de estabilizar la base.**

Mantener pruebas cortas y diferenciadas, con instrucciones inmediatas y un feedback claro. Mecánicas sugeridas a evaluar:

1. **Precisión/timing:** detener un indicador dentro de una zona objetivo.
2. **Secuencia de flechas:** reproducir una secuencia de direcciones, con velocidad y longitud progresivas.
3. **Mash de botón:** pulsaciones rápidas para levantar o sostener una carga; la carga puede retroceder si baja el ritmo.
4. **Resistencia por repeticiones:** completar una serie con objetivos que cambian de una repetición a otra.
5. **Circuito mixto:** seleccionar o barajar estas pruebas en una secuencia breve, comunicando la siguiente acción antes de cada transición.

- [ ] Elegir una mecánica nueva por vez.
- [ ] Definir entradas válidas, ventanas de tiempo, fallo, éxito y puntuación antes de implementarla.
- [ ] Evitar que velocidad de pulsación o repetición de eventos permita explotar el puntaje.
- [ ] Mantener accesibilidad básica: alternativa a pulsaciones extremadamente rápidas, instrucciones legibles y controles táctiles funcionales.
- [ ] Evaluar si las mecánicas existentes deben conservarse, modificarse o reemplazarse.

**Criterio de salida:** cada minijuego se entiende sin explicación externa y su resultado es consistente con la acción del jugador.

### Fase 4 — Audio y feedback
**Estado: pendiente.**

- [ ] Revisar volumen, activación explícita y comportamiento del botón de sonido.
- [ ] Añadir señales sonoras diferenciadas para inicio, acierto, error, transición y final.
- [ ] Añadir música de fondo solo con audio original o licencia adecuada. No incorporar la música de Rocky sin derechos.
- [ ] Permitir jugar sin sonido y respetar las restricciones de reproducción automática del navegador.
- [ ] Comprobar que los efectos no interfieran con el rendimiento ni con la lectura visual.

**Criterio de salida:** audio controlable, con feedback útil y sin dependencias de material no autorizado.

### Fase 5 — Balance, interfaz y compatibilidad
**Estado: pendiente.**

- [ ] Ajustar duración, curva de dificultad, multiplicadores, combos y puntuaciones.
- [ ] Revisar legibilidad de HUD, instrucciones, estados de éxito/error y resultados.
- [ ] Probar teclado, ratón y pantalla táctil en los cuatro ejercicios y en las nuevas mecánicas.
- [ ] Probar tamaños de pantalla y redimensionado.
- [ ] Verificar modo Zen, tabla local, iniciales y reinicio.
- [ ] Revisar accesibilidad, contraste, foco de controles y posibilidad de desactivar vibración/efectos intensos.

**Criterio de salida:** recorrido completo sin bloqueos ni inconsistencias visibles en escritorio y móvil.

### Fase 6 — Regresión, documentación y decisión de integración
**Estado: pendiente.**

- [ ] Ejecutar un recorrido completo repetido varias veces.
- [ ] Registrar navegador, dispositivo, commit, pasos, resultado y defectos restantes.
- [ ] Mantener separados los resultados de validación estática y de validación manual.
- [ ] Actualizar este roadmap, el informe de auditoría y el README.
- [ ] Evaluar seguridad de la puntuación local y límites de `localStorage`.
- [ ] Solo después, proponer una estrategia de integración; no conectar recompensas, usuarios ni ranking real desde este prototipo.

**Criterio de salida:** no hay defectos críticos abiertos; los riesgos restantes están explícitos y existe una decisión consciente sobre integración.

## Priorización

1. **P0 — Bloqueante:** visuales rotas o inconsistentes, canvas fuera de escala, ejercicio invisible, overlay que impide jugar, error que corta el circuito.
2. **P1 — Alta:** animación no sincronizada con el estado, ciclo de puntuación explotable, transición o temporizador incorrecto.
3. **P2 — Media:** balance, feedback, audio, responsive y pulido.
4. **P3 — Evolutiva:** nuevos minijuegos, variaciones, contenido y futuras integraciones.

## Registro de validación

No se considera validación de navegador el mero análisis del código ni el chequeo sintáctico de JavaScript. Para cada prueba futura, completar:

| Fecha | Commit | Navegador/dispositivo | Flujo probado | Resultado | Evidencia/defectos |
|---|---|---|---|---|---|
| Pendiente | Pendiente | Pendiente | Inicio → circuito completo → resultado | No validado | La versión descargada sigue reportándose visualmente rota |
| 2026-10-27 (2.ª pasada) | Rama `fix/iron-pixel-v2-estabilizacion`, cambios AUD-18 a AUD-27 | Chrome de escritorio real 1360 px; marcos de 390 y 360 px | Circuito completo con bot en tiempo real, Zen con SIGUIENTE/TERMINAR, cada prueba suelta, curl con tecla y puntero, cambio de modo tras terminar | Sin errores de consola; todo según lo esperado | Capturas tomadas durante la sesión, no guardadas en el repo; falta Firefox, Safari y teléfono real |
| 2026-10-27 | Rama `fix/iron-pixel-v2-estabilizacion` | Chromium headless 1280 px, 2× y emulación iPhone 13 (3×) | Circuitos completos con entradas aleatorias, Zen, prueba individual, cada ejercicio por separado | Sin errores de consola; fallo visual reportado no reproducido | Validación automatizada con tiempo simulado; sin capturas guardadas en el repo; Firefox/Safari y dispositivos reales sin probar |

## Documentos relacionados

- [Auditoría de bugs y estado técnico](AUDITORIA_BUGS.md)
- [README del prototipo](../README.md)
