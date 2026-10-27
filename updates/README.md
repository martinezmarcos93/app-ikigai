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
- Circuito de cuatro pruebas en orden aleatorio: press de banca (timing), dominadas (ciclo de movimiento), curl de bíceps (mantener y soltar) y bicicleta fija (alternancia de pedales).
- 20 segundos por ejercicio y transición de 3 segundos entre pruebas.
- Clasificación de repetición: PERFECT (25 puntos), GOOD (10) y FLOJO (2).
- Combo acumulativo: +0,5× cada tres aciertos seguidos, hasta ×3.
- Selector de peso liviano, medio y pesado; cambia velocidad, amplitud de la zona de precisión y multiplicador de puntuación.
- Dificultad progresiva: la zona PERFECT se estrecha con las repeticiones y el indicador acelera.
- Efectos visuales: puntos flotantes, vibración breve de pantalla y animación del levantamiento.
- Efectos sonoros 8-bit generados con Web Audio, activables por el usuario.
- Cuatro misiones de demostración, una por ejercicio del circuito.
- Tabla de mejores puntuaciones local con iniciales, guardada en `localStorage`.
- Modo Zen de práctica libre, finalizable manualmente y con límite de puntuación de 500.
- Controles de ratón, pantalla táctil y teclado; en bicicleta se alternan los pedales izquierdo y derecho.\n- Selector de avatar masculino/femenino en pixel art, visible en la cabecera y sincronizado con el selector de ajustes.\n- Mecánicas diferenciadas: press con recorrido completo del indicador, dominadas con alternancia de fases, curl mediante mantener/soltar y bicicleta con ciclo izquierda-derecha.

## Límites conocidos de esta iteración

- **No es una versión conectada a Ikigai Training.** No inicia sesiones en el servidor ni registra usuarios, monedas, canjes, premios, asistencia o ranking global.
- La tabla de récords y las misiones son locales al navegador y se pueden borrar o manipular. No son aptas para otorgar premios.
- La calibración de las ventanas de puntuación y de la dificultad sigue pendiente de validación manual.
- Las mecánicas de los tres ejercicios requieren pruebas manuales de dificultad y calibración; el press limita cada recorrido a un intento para evitar sumar puntos mediante pulsaciones frenéticas.
- Falta una batería de pruebas manuales en escritorio y móvil, revisión de accesibilidad, calibración del balance de puntuación y evaluación visual de las animaciones.

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

La prioridad inmediata es reproducir y resolver el fallo visual reportado y validarlo en navegador. La revisión sintáctica por sí sola no se considera una prueba funcional.
