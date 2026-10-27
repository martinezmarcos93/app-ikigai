# Iron Pixel V2 — prototipo independiente

## Objetivo

Este HTML es una exploración jugable del minijuego arcade de Ikigai Training. Está aislado del frontend y backend existentes para que se pueda probar y evaluar sin alterar el juego integrado.

## Cómo ejecutarlo

1. Descargá `updates/iron-pixel-v2.html`.
2. Abrilo directamente en un navegador moderno (Chrome, Edge, Firefox u Opera).
3. Pulsá **Iniciar circuito**.
4. Activá el sonido desde el botón correspondiente si querés probar los efectos de audio.

No requiere instalación, servidor, dependencias ni conexión a la aplicación.

## Mecánicas incluidas

- Estética pixel-art y paleta de Ikigai Training (negro, rojo, grises y blanco). El canvas se ajusta al tamaño de pantalla y a la densidad de píxeles para verse nítido.
- Circuito de cuatro pruebas en orden aleatorio; el panel lateral muestra el orden real de la partida.
- 20 segundos por ejercicio y transición de 3 segundos entre pruebas.
- Clasificación de repetición: PERFECT (25 puntos), GOOD (10) y FLOJO (2).
- Combo acumulativo: +0,5× cada tres aciertos seguidos, hasta ×3 (se reinicia en cada transición).
- Selector de peso liviano, medio y pesado; cambia velocidad, amplitud de las ventanas de precisión y multiplicador de puntuación.
- Dificultad progresiva en el press: la zona PERFECT se estrecha con las repeticiones y el indicador acelera.
- Efectos visuales: resultado de cada repetición en el piso, puntaje flotante, vibración breve de pantalla y animación suave de las barras.
- Efectos sonoros 8-bit generados con Web Audio, activables por el usuario.
- Tres misiones de demostración: 10 PERFECT, alcanzar combo ×3 y probar los 4 ejercicios.
- Tabla de mejores puntuaciones local con iniciales, guardada en `localStorage`. **Solo suman los circuitos completos.**
- Modo Zen: práctica sin temporizador, con botón SIGUIENTE EJERCICIO en el circuito, tope de 500 puntos y sin récord.
- Modo de una sola prueba: también es práctica y no suma récord.
- Selector de avatar masculino/femenino en pixel art, visible en la cabecera y sincronizado con el selector de ajustes.

### Reglas de cada ejercicio

Cada ejercicio tiene su propio medidor, con los colores de la leyenda de puntos (verde PERFECT, amarillo GOOD, gris FLOJO). El medidor se dibuja con las mismas constantes que usa la puntuación.

| Ejercicio | Acción | Puntuación |
|---|---|---|
| Press de banca | Pulsar con el marcador en la zona verde. Un intento por recorrido de la barra. | Según la distancia al centro; la zona se achica con el peso y las repeticiones. |
| Dominadas | Un toque sube y otro baja (ritmo de dos toques). | Tiempo entre toques: menos de 700 ms no cuenta (ESPERÁ); hasta 1250 ms PERFECT; hasta 1900 ms GOOD; más, FLOJO. |
| Curl de bíceps | Mantener y soltar. | Óptimo a 750 ms: PERFECT ±160 ms (× factor de peso 1 / 0,83 / 0,68), GOOD hasta 2,6× esa ventana; se suelta solo a los 1500 ms (FLOJO). |
| Bicicleta | Alternar pedal izquierdo y derecho, empezando por el izquierdo. | Tiempo del ciclo izquierda → derecha: menos de 650 ms no cuenta; hasta 1500 ms PERFECT; hasta 2300 ms GOOD; más, FLOJO. |

### Controles

- **Teclado:** Espacio / ↑ / Enter para press, dominadas y curl. En la bicicleta, ←/→ o A/D; Espacio no pedalea.
- **Ratón y táctil:** botón principal o toque sobre el canvas. En la bicicleta, botones IZQUIERDA / DERECHA (el pedal esperado aparece resaltado) o mitad izquierda / derecha del canvas.
- Si el foco quedó en un botón tras un click, el teclado de juego sigue funcionando; con navegación por Tab se respeta la activación nativa de cada botón.

## Límites conocidos de esta iteración

- **No es una versión conectada a Ikigai Training.** No inicia sesiones en el servidor ni registra usuarios, monedas, canjes, premios, asistencia o ranking global.
- La tabla de récords y las misiones son locales al navegador y se pueden borrar o manipular. No son aptas para otorgar premios.
- La calibración de las ventanas de puntuación y de la dificultad sigue pendiente de validación manual.
- Las mecánicas de los cuatro ejercicios requieren pruebas manuales de dificultad y calibración; el press limita cada recorrido a un intento para evitar sumar puntos mediante pulsaciones frenéticas.
- Falta una batería de pruebas manuales en dispositivos reales, revisión de accesibilidad y evaluación visual de las animaciones. La validación hecha hasta ahora es automatizada (ver más abajo) y no sustituye una prueba manual.

## Validación automatizada (2026-10-27)

Hecha con Chromium headless (escritorio 1280 px, 2× y emulación de iPhone 13 a 3×) y tiempo simulado. **No se probó en Firefox, Safari ni dispositivos reales.**

- Sin errores de consola ni de página en 4 circuitos completos con entradas aleatorias (avatar masculino/femenino, los tres pesos) y en 3 circuitos consecutivos sin estado residual.
- El orden del panel coincide con el orden jugado en todas las partidas.
- Sin scroll horizontal a 390 px; el canvas ajusta su resolución al tamaño CSS × devicePixelRatio, también al redimensionar.
- Puntaje en 20 s con el juego "óptimo" de cada ejercicio (peso medio): dominadas 1754, bicicleta 1754, curl 1642. Pulsar el press cada 130 ms: 27 puntos. Curl manteniendo 400 ms (el exploit anterior): unos 150 puntos (antes 2762).

## Próximo ciclo de trabajo sugerido

1. Probar controles, temporizadores y transiciones en escritorio y móvil.
2. Ajustar la curva de dificultad y validar el comportamiento de combo, peso y modo Zen.
3. Pulir animaciones, feedback y diseño de los ejercicios.
4. Revisar reglas, persistencia y posibles abusos antes de diseñar una integración futura con la economía real de la aplicación.

## Estado de integración

Intencionalmente no se modifica `iron-pixel.js`, la API, las migraciones ni las reglas de puntos existentes. La integración posterior queda a cargo del mantenedor del proyecto junto con Claude, después de validar el prototipo.

## Plan de trabajo y auditoría

- [Roadmap de estabilización y evolución](iron-pixel-v2/ROADMAP.md): fases, prioridades y criterios de salida.
- [Auditoría de bugs y estado técnico](iron-pixel-v2/AUDITORIA_BUGS.md): hallazgos, riesgos, evidencias disponibles y protocolo de regresión.

El fallo visual reportado ("visuales completamente rotas") **no se pudo reproducir** en Chromium; ver la actualización de la auditoría. Antes de darlo por cerrado hace falta saber en qué navegador y dispositivo se vio y con qué archivo. La revisión sintáctica por sí sola no se considera una prueba funcional.
