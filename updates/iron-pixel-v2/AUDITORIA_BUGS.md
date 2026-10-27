# Iron Pixel V2 — Auditoría de bugs y estado técnico

**Rama auditada:** `feat/iron-pixel-v2-prototype`  
**Archivo principal:** `updates/iron-pixel-v2.html`  
**Estado:** auditoría preliminar; pendiente de reproducción y verificación real en navegador.  
**Advertencia:** este documento diferencia observaciones reportadas, riesgos inferidos del código y pruebas todavía no realizadas.

## 1. Resumen ejecutivo

El prototipo contiene cuatro pruebas (press de banca, dominadas, curl de bíceps y bicicleta), temporizadores, transición, puntuación y elementos de interfaz. El historial registra varios arreglos dirigidos a ciclos de puntuación y animaciones. Sin embargo, el usuario informa que la versión descargada más reciente continúa con las visuales completamente rotas.

La conclusión operativa es que los arreglos previos no demostraron resolver el problema visual. El último parche de bicicleta solo pasó una comprobación estática de sintaxis; no se realizó una prueba completa de navegador. Por tanto, no se debe declarar estable el renderizado ni seguir agregando mecánicas hasta reproducir el fallo.

## 2. Evidencia disponible y límites

### Hechos registrados
- El juego se distribuye como un HTML independiente, sin instalación ni servidor.
- El canvas se utiliza para representar la escena y las animaciones.
- El circuito actual incluye cuatro ejercicios en orden aleatorio, con 20 segundos por ejercicio y transiciones de 3 segundos, según la documentación existente.
- Se han realizado cambios sucesivos para corregir ciclos de puntuación y animación en press, dominadas, curl y bicicleta.
- El último cambio de bicicleta agregó amortiguación de pedaleo, sincronización de radios con la fase de pedaleo y validación del orden de entradas.
- La validación de sintaxis JavaScript pasó para ese cambio.
- No se realizó una prueba funcional integral en navegador después del último parche.
- Se reportó que la versión descargada sigue mostrando visuales rotas.

### Lo que todavía no está demostrado
- La causa raíz de la rotura visual.
- Si el fallo ocurre en todos los navegadores, solo en una versión concreta o solo en determinadas resoluciones.
- Si el origen está en el renderizado del canvas, el escalado, el orden de dibujo, los estados de animación, las capas de interfaz o una combinación.
- Si los problemas observados en la bicicleta se comparten con los demás ejercicios.

No atribuir el fallo a una causa concreta hasta reproducirlo y aislarlo.

## 3. Registro de hallazgos

### AUD-01 — Fallo visual general reportado
**Severidad:** P0 — bloqueante.  
**Estado:** abierto; falta reproducción controlada.

**Evidencia:** se informó que las visuales siguen completamente rotas en la última versión descargada.

**Impacto:** no puede evaluarse la jugabilidad ni considerarse confiable la relación entre entradas, animaciones y puntuación.

**Próximos pasos:**
1. Registrar el commit exacto del HTML descargado.
2. Abrir una copia limpia en un navegador identificado.
3. Capturar inicio, ejercicio activo, transición y resultado.
4. Revisar consola y dimensiones reales del canvas.
5. Comparar el resultado con el archivo servido desde la rama.

**Criterio de cierre:** causa identificada, corrección reproducible y recorrido completo comprobado visualmente.

### AUD-02 — La comprobación sintáctica no valida el renderizado
**Severidad:** P0 como brecha de validación.  
**Estado:** confirmado.

**Evidencia:** la validación estática de JavaScript pasó, pero no hubo prueba integral en navegador; después se informó que las visuales seguían rotas.

**Impacto:** la sintaxis correcta puede coexistir con errores de coordenadas, capas, escalado, estado, temporización o lógica de dibujo.

**Acción:** separar explícitamente pruebas estáticas, pruebas de lógica y pruebas visuales/manuales en cada cambio.

**Criterio de cierre:** cada cambio visual se verifica en navegador con evidencia del flujo afectado.

### AUD-03 — Animación de bicicleta no demostrada como sincronizada
**Severidad:** P1 — alta.  
**Estado:** abierto.

**Evidencia:** se había observado que la bicicleta parecía estática entre entradas mientras la rueda giraba; se aplicó un parche para animar continuamente el pedaleo y sincronizar los radios, pero el resultado no se confirmó en navegador.

**Riesgo:** pose del ciclista, fase de pedaleo y puntuación podrían no corresponderse temporalmente.

**Acción:** probar pedaleo izquierdo/derecho, entrada inválida, intervalo largo, ciclo completo y transición al ejercicio siguiente.

**Criterio de cierre:** animación continua y legible; un ciclo válido se puntúa una sola vez y las entradas rechazadas no corrompen el estado.

### AUD-04 — Dominadas: ciclo de movimiento y puntuación
**Severidad:** P1 — alta.  
**Estado:** requiere regresión manual.

**Antecedente:** cambios previos trataron la repetición de pulsaciones y exigieron movimiento completo. La lógica descrita alternaba fases y utilizaba ventanas temporales; una pose temporal no garantiza por sí sola un ciclo visual completo.

**Riesgos a verificar:**
- sumar puntos por pulsaciones repetidas sin completar subida y bajada;
- discrepancia entre la pose visible y la fase lógica;
- bloqueo o respuesta inesperada por intervalos de entrada.

**Criterio de cierre:** la interfaz muestra claramente las fases y solo puntúa ciclos completos válidos.

### AUD-05 — Press de banca: recorrido y doble puntuación
**Severidad:** P1 — alta.  
**Estado:** requiere regresión manual.

**Antecedente:** se registraron arreglos para exigir el recorrido completo de la barra/indicador y evitar puntuación antes del primer ciclo.

**Riesgos a verificar:** puntuación antes de completar el recorrido, múltiples puntos por un solo ciclo, barra y feedback visual desincronizados.

**Criterio de cierre:** un ciclo completo genera como máximo un resultado; un intento incompleto no suma.

### AUD-06 — Curl de bíceps: mantener/soltar y límite de duración
**Severidad:** P1 — alta.  
**Estado:** requiere regresión manual.

**Antecedente:** la mecánica documentada depende de mantener y soltar; existe un límite temporal que puede finalizar automáticamente el intento.

**Riesgos a verificar:** estado visual incoherente al soltar, liberación automática sin feedback claro, entrada duplicada o puntuación incorrecta.

**Criterio de cierre:** las instrucciones explican la acción, la animación responde y cada intento termina una sola vez.

### AUD-07 — Temporizadores, transiciones y orden aleatorio
**Severidad:** P1 — alta.  
**Estado:** requiere prueba integral.

**Antecedente:** circuito documentado de cuatro ejercicios, 20 segundos por ejercicio y 3 segundos de transición; orden aleatorio.

**Riesgos a verificar:** ejercicio omitido/duplicado, transición que se superpone al ejercicio, temporizador que no se reinicia, estado anterior que persiste después de comenzar de nuevo.

**Criterio de cierre:** completar varios circuitos consecutivos y confirmar los cuatro ejercicios, transiciones y finalización.

### AUD-08 — Escalado del canvas y responsive
**Severidad:** P0 o P1 según el síntoma reproducido.  
**Estado:** hipótesis por investigar; causa no confirmada.

**Riesgos a verificar:** dimensiones CSS y resolución interna desalineadas, relación de aspecto incorrecta, coordenadas calculadas para un tamaño fijo, clipping, pixel art borroso o contenido fuera del canvas.

**Acción:** medir `canvas.width`, `canvas.height`, tamaño CSS y relación de aspecto; probar redimensionado, pantalla HiDPI y móvil.

**Criterio de cierre:** escena completa, centrada y legible en las resoluciones probadas.

### AUD-09 — Estado de inicio, overlays y reinicio
**Severidad:** P1 — alta.  
**Estado:** pendiente.

**Riesgos a verificar:** overlay ocultando la escena durante el juego, controles habilitados antes de iniciar, reinicio parcial de variables o animaciones que continúan después del final.

**Criterio de cierre:** inicio, partida, pausa/transición si aplica, resultado y nueva partida funcionan sin estados residuales.

### AUD-10 — Puntuación local y récords
**Severidad:** P2 para el prototipo; riesgo alto si se integrara con premios reales.  
**Estado:** limitación documentada.

**Evidencia:** el README indica que récords y misiones viven localmente en el navegador y pueden manipularse.

**Acción:** mantener la puntuación como demostrativa y no conectarla a recompensas, monedas ni ranking global sin validación del servidor.

**Criterio de cierre:** límite claramente comunicado y decisión de integración documentada.

## 4. Historial de áreas intervenidas

El historial de trabajo incluye cambios titulados o descritos como:
- corrección de ciclos y cantidad de ejercicios de la misión;
- prevención de puntuación del press antes del primer ciclo completo;
- exigencia de ciclo completo en press y progreso de misión;
- corrección de temporización de bicicleta para comenzar con pedal izquierdo;
- reinicio del tiempo del ciclo de bicicleta después de rechazar una secuencia;
- sincronización de pose de dominadas con la fase del ejercicio;
- prevención de spam de dominadas y reconstrucción de la animación de bicicleta;
- alineación de brazos del press/curl con la barra;
- aleatorización del circuito y requisito de movimiento completo en dominadas;
- animación continua de bicicleta y validación de ciclos de pedaleo.

Este historial demuestra iteración sobre síntomas concretos, pero no reemplaza una prueba de regresión completa. No se afirma que todos estos defectos continúen presentes; se listan como áreas que deben volver a verificarse después de estabilizar el renderizado.

## 5. Protocolo mínimo de reproducción y regresión

Para cada ejecución, anotar navegador y versión, sistema/dispositivo, resolución, commit y si el archivo fue abierto localmente o desde GitHub.

1. Abrir el archivo y comprobar la pantalla inicial.
2. Iniciar circuito y verificar que el overlay desaparezca correctamente.
3. Capturar cada uno de los cuatro ejercicios mientras está activo.
4. Completar entradas válidas e inválidas y comprobar animación y puntuación.
5. Observar la transición y el inicio del siguiente ejercicio.
6. Completar el circuito y comprobar resultado y récord local.
7. Iniciar otra partida y comprobar que no haya estado residual.
8. Repetir en otra resolución; luego verificar móvil/táctil.
9. Revisar errores de consola.

Registrar cada caso con: ID, pasos, resultado esperado, resultado observado, severidad, evidencia, commit y estado.

## 6. Decisiones de diseño derivadas de la devolución de amigos

Estas son propuestas de producto, no bugs confirmados:
- Añadir una prueba de secuencia de flechas, con dificultad progresiva.
- Añadir una prueba de pulsaciones rápidas para levantar o sostener una carga.
- Combinar pruebas en un circuito mixto y aleatorizado.
- Conservar una prueba de precisión/timing si aporta variedad.
- Añadir música solo con material original o con licencia adecuada; no incorporar la canción de Rocky sin autorización.
- Implementar una mecánica nueva por vez, solo después de cerrar los defectos P0 y verificar los ejercicios actuales.

## 7. Decisión técnica

**No continuar ampliando mecánicas todavía.** Primero reproducir el fallo visual reportado, encontrar la causa y comprobar la corrección en navegador. La prioridad es recuperar una base observable y estable, no acumular más código encima de una experiencia que no puede validarse.

Véase también [Roadmap de estabilización y evolución](ROADMAP.md).
