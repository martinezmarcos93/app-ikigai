# Identidad visual — Ikigai Training

## Marca de referencia

El archivo fuente actual es `assets/ikigai-logo.jpg` (720 × 690 px, JPEG con fondo negro). El diseño contiene el nombre IKIGAI en tipografía angular metálica, un guerrero samurái musculoso con pesas y una gran forma roja geométrica detrás; el texto TRAINING cierra la composición inferior. El contraste rojo/negro, los contornos oscuros, el metal blanco/gris y la composición central son partes distintivas de la marca.

**No reemplazar el logo por un monograma genérico, no reconstruirlo con otra tipografía y no alterar la figura.** La interfaz debe usar el archivo original como imagen, conservando su proporción.

## Paleta registrada

El rojo dominante se midió en el JPG original, tras reducir una copia de análisis para obtener un histograma:

| Token | Color | Uso |
| --- | --- | --- |
| Rojo de marca | `#E31A20` | Acentos y elementos de marca |
| Rojo luminoso | `#EC2124` | Foco, interacción y énfasis |
| Rojo oscuro | `#7C090F` | Bordes y superficies de acento discretas |
| Negro de marca | `#000000` | Fondo original del logo e iconos de aplicación |
| Superficie base | `#080808` | Fondo de la aplicación |
| Superficie | `#111112` | Paneles |
| Superficie elevada | `#171719` | Controles elevados |
| Blanco de interfaz | `#F3F3F5` | Texto principal |
| Plata/gris metálico | `#808281` | Referencia aproximada del metal del logo |
| Texto secundario | `#9C9CA3` | Texto auxiliar |

Los tokens compartidos viven en `tokens.css`. La paleta original del logo tiene degradados y matices adicionales; los tokens no pretenden reducir todos esos píxeles a un único rojo.

## Uso del logo

- Usar `object-fit: contain`; no recortar en círculo ni estirar.
- Mantener una zona de protección suficiente en iconos de aplicación.
- Sobre fondo negro, el JPEG se integra con la superficie. En fondos distintos, usar un contenedor negro; no aplicar filtros CSS al logo.
- El JPG no contiene transparencia. **No convertir automáticamente el negro en transparente**: las líneas negras del contorno del samurái, las pesas y la tipografía están conectadas visualmente con el fondo. Un borrado por color destruiría partes de la marca.
- Una versión vectorial o PNG transparente fiel requiere el archivo maestro editable o un trabajo de recorte manual revisado. No se declara entregada una variante transparente falsa.
- Los iconos funcionales de interfaz sí pueden usar SVG monocromo con `currentColor`; no deben imitar ni reemplazar el logo.

## Tipografía y tono

La interfaz conserva las fuentes condensadas existentes (Bebas Neue para titulares de marca y Rajdhani para interfaz). Usar titulares compactos y fuertes, con jerarquía clara; reservar el rojo para énfasis y no llenar superficies grandes con rojo brillante.

## Recursos

- Fuente: `../ikigai-logo.jpg`
- Tokens CSS: `tokens.css`
- Símbolos SVG de interfaz: `../icons/ikigai-symbols.svg`
- Iconos PWA rasterizados: `../pwa/`

Los iconos de aplicación se generan a partir de la imagen fuente sin modificar el dibujo, manteniendo fondo negro y márgenes seguros. No se afirma que tengan fondo transparente.
