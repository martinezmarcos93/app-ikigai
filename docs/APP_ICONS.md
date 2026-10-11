# Ícono y pantallas de carga de Ikigai — cómo se usa cada archivo

El logo que se usa es el ráster que entregó el gimnasio, **sin redibujar** (`assets/ikigai_training_production_assets/` en la
carpeta del proyecto; las copias que usa la app están en `assets/pwa/` y `assets/brand/`). Todos son PNG con fondo negro
`#000000`, el mismo `background_color` del manifiesto: por eso no se ve ningún recuadro al abrir la app.

| Archivo | Tamaño | Para qué sirve |
| --- | --- | --- |
| `assets/pwa/icon-192.png` | 192 | Ícono estándar del manifiesto; también el logo de la pantalla de carga dentro de la app |
| `assets/pwa/icon-512.png` (= `assets/brand/ikigai-training-master-512.png`) | 512 | Ícono grande del manifiesto: lo usa Chrome para la pantalla de inicio de la app instalada. Es además el **ícono de 512 px que pide Google Play** |
| `assets/pwa/icon-maskable-512.png` | 512 | Ícono *adaptativo* de Android: el logo ocupa solo el centro (el círculo rojo mide ~66 % del lado, dentro de la zona segura de 80 %), así Android lo recorta en círculo, cuadrado redondeado o gota sin cortar nada |
| `assets/pwa/apple-touch-icon.png` | 180 | Ícono de pantalla de inicio en iPhone/iPad (sin transparencia) |
| `assets/pwa/favicon-48.png` | 48 | Pestaña del navegador |
| `assets/pwa/splash-1080x1920.png` | 1080×1920 | Arte vertical de bienvenida. **No lo usa Android** (ver abajo); sirve como base de las pantallas de inicio de iOS y como captura/arte de la ficha en Google Play |

## 1. Pantalla de carga al tocar la app

Hoy son **dos pantallas encadenadas**, y solo una la dibujamos nosotros:

1. **La que arma el sistema** (Chrome/Android, en la PWA instalada): muestra el ícono sobre el `background_color` del manifiesto
   y el nombre de la app. No acepta una imagen propia; sale de `icon-512.png` + `background_color: #000000` + `name: "Ikigai Training"`.
   Por eso el logo ya trae fondo negro: se funde con el fondo y parece una sola pieza.
2. **La de la propia app** (`#bootSplash` en `portal.html`): el logo `icon-192.png` latiendo suavemente sobre negro mientras el
   portal averigua si hay sesión; se desvanece sola en cuanto termina (y, como red de seguridad, a los 8 s aunque algo falle).

iPhone no genera la primera: necesitaría una imagen `apple-touch-startup-image` por cada tamaño de pantalla. Si Ikigai llegara a
iPhone, se generan desde `splash-1080x1920.png` (opcional; no es necesario para Android).

## 2. Ícono de la app en el escritorio de Android

- **Hoy (PWA, «Instalar app» de Chrome):** Chrome genera un *WebAPK* con `icon-maskable-512.png` (adaptativo) y, si falta, con
  `icon-512.png`. No hay que hacer nada más: el manifiesto ya declara los tres.
- **Con APK propia (más adelante, con dominio):** se genera con *Bubblewrap* (Trusted Web Activity) a partir del mismo manifiesto:
  - ícono adaptativo = `icon-maskable-512.png` como primer plano sobre un fondo liso `#000000` (Bubblewrap arma además los PNG de
    48/72/96/144/192 px para Android viejo);
  - el logo debe quedar dentro del 66 % central (ya lo está: la zona segura de un adaptativo es un círculo de 66 dp sobre 108 dp).

## 3. Ícono de la APK al descargarla e instalarla

El instalador de Android muestra **el mismo ícono del lanzador** (el adaptativo de arriba): no es un archivo aparte. Distinto es
Google Play, donde la ficha lleva sus propios recursos:

| Recurso de la ficha de Play | Qué usar |
| --- | --- |
| Ícono de la app (512×512 PNG, ≤ 1 MB, sin esquinas redondeadas: Play aplica la máscara) | `icon-512.png` tal cual |
| Gráfico de funciones (1024×500) | **Falta**: componerlo con el logo sobre negro y el eslogan |
| Capturas de pantalla del teléfono | Se sacan del portal (390×844) cuando el diseño esté cerrado |

Para que la APK **no muestre la barra de direcciones** hace falta el dominio con HTTPS y publicar `/.well-known/assetlinks.json`
con la huella de la firma (Digital Asset Links). Sin dominio, la APK se abre como una pestaña de Chrome con barra.

## Limitaciones conocidas

- Son rásters, no vectores: no ampliar por encima de 512 px. El maestro vectorial lo está trazando el gimnasio; cuando exista,
  se regeneran todos los PNG con `scripts/generate-pwa-icons.py` (hoy parte del JPG original) y se vuelve a validar con
  `scripts/validate-brand-assets.py`.
- Falta una versión **monocroma** (silueta blanca sobre transparente, 96 px) si más adelante hay notificaciones.
