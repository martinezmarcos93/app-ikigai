# APK de Ikigai (TWA)

La APK es una **Trusted Web Activity**: un envoltorio de Android que abre el portal del servidor
(`https://app.tudominio.com/portal.html`) a pantalla completa, sin barra de direcciones. **No contiene el
sistema**: portal, API y base de datos viven en el servidor, así que actualizar el servidor actualiza la app
para todos sin reinstalar.

## Cómo se arma

```bash
bash apk/build-apk.sh app.tudominio.com 1.0.0 1     # host, versionName, versionCode
```

(`bash` explícito: el disco del proyecto es NTFS y no guarda el permiso de ejecución.)

El script compila con [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap), firma, verifica la firma y deja:

| Archivo | Para qué |
| --- | --- |
| `landing/downloads/ikigai-training.apk` | lo que descargan profesores y miembros (no se versiona: `*.apk` está en `.gitignore`) |
| `landing/app.json` | versión, tamaño, SHA-256 y dirección de la app; la landing lo lee para armar el botón de descarga |
| `deploy/assetlinks.json` | prueba de que la app y el dominio son del mismo dueño; se publica en `/.well-known/assetlinks.json` |

Requisitos (una sola vez): JDK 17 y Android SDK en `~/Android` (`jdk/`, `sdk/`), `sdkmanager "build-tools;36.1.0"
"platforms;android-36"` y `npm i @bubblewrap/cli@1.27.0` en `~/src/ikigai-apk`. El script compila en esa carpeta
porque el disco NTFS del proyecto no permite ejecutar binarios.

## Reglas que no se pueden saltear

1. **La dirección queda grabada en la APK.** Cambiar de dominio exige recompilar y volver a repartir la app.
2. **La clave de firma es insustituible.** Vive en `~/.ikigai-signing/` (`ikigai.keystore` y `password.txt`), nunca
   en el repositorio. Si se pierde, nadie puede actualizar la app instalada: hay que desinstalar y reinstalar.
   **Hacer copia de seguridad fuera de esta computadora** (gestor de contraseñas o disco cifrado).
3. **`assetlinks.json` tiene que estar publicado antes de repartir la APK.** Sin él, Android abre la app como una
   pestaña de Chrome con barra de direcciones. Se despliega con la imagen web (`deploy/web.Dockerfile`).
   Comprobar: `curl https://app.tudominio.com/.well-known/assetlinks.json`.
4. **Actualizar la app** (solo hace falta si cambia la APK, no por cambios del portal): subir `versionCode`
   (2, 3, …) y volver a correr el script; Android instala encima porque la firma es la misma.

## Instalación fuera de Play Store

Quien descarga el archivo tiene que permitir «instalar apps de esta fuente» una vez. La landing lo explica paso a
paso. Play Protect puede advertir que la app no es conocida; es esperable con APKs fuera de la tienda.

## Alcance

Sin notificaciones push (el servidor no las envía) y sin función nativa alguna: si algún día hacen falta, se
evalúa Capacitor (ver Fase 8 de la hoja de ruta).
