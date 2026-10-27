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

- Estética pixel-art y paleta de Ikigai Training (negro, rojo, grises y blanco).
- Circuito de tres pruebas: press de banca (timing), dominadas (toques rápidos) y curl de bíceps (mantener y soltar).
- 20 segundos por ejercicio y transición de 3 segundos entre pruebas.
- Clasificación de repetición: PERFECT (25 puntos), GOOD (10) y FLOJO (2).
- Combo acumulativo: +0,5× cada tres aciertos seguidos, hasta ×3.
- Selector de peso liviano, medio y pesado; cambia velocidad, amplitud de la zona de precisión y multiplicador de puntuación.
- Dificultad progresiva: la zona PERFECT se estrecha con las repeticiones y el indicador acelera.
- Efectos visuales: puntos flotantes, vibración breve de pantalla y animación del levantamiento.
- Efectos sonoros 8-bit generados con Web Audio, activables por el usuario.
- Tres misiones de demostración durante la sesión.
- Tabla de mejores puntuaciones local con iniciales, guardada en `localStorage`.
- Modo Zen experimental con una duración de 60 segundos y límite de puntuación de 500.
- Controles de ratón, pantalla táctil y teclado (Espacio, flecha arriba o Enter).

## Límites conocidos de esta iteración

- **No es una versión conectada a Ikigai Training.** No inicia sesiones en el servidor ni registra usuarios, monedas, canjes, premios, asistencia o ranking global.
- La tabla de récords y las misiones son locales al navegador y se pueden borrar o manipular. No son aptas para otorgar premios.
- El modo Zen de esta primera iteración usa una sesión de 60 segundos; no es todavía el modo sin temporizador definitivo.
- Las mecánicas de dominadas y curl son prototipos de interacción y requieren ajuste de dificultad y calibración.
- Falta una batería de pruebas manuales en escritorio y móvil, revisión de accesibilidad y balance de puntuación.

## Próximo ciclo de trabajo sugerido

1. Probar controles, temporizadores y transiciones en escritorio y móvil.
2. Ajustar la curva de dificultad y validar el comportamiento de combo, peso y modo Zen.
3. Pulir animaciones, feedback y diseño de los ejercicios.
4. Revisar reglas, persistencia y posibles abusos antes de diseñar una integración futura con la economía real de la aplicación.

## Estado de integración

Intencionalmente no se modifica `iron-pixel.js`, la API, las migraciones ni las reglas de puntos existentes. La integración posterior queda a cargo del mantenedor del proyecto junto con Claude, después de validar el prototipo.
