#!/usr/bin/env bash
# Compila, firma y publica (en landing/) la APK de Ikigai: una TWA que abre el portal del servidor.
#
#   apk/build-apk.sh app.tudominio.com [versionName] [versionCode]
#
# - La direccion queda grabada dentro de la APK: cambiarla exige recompilar y volver a distribuir.
# - La clave de firma vive en ~/.ikigai-signing (fuera del repo). Se crea la primera vez. HACER COPIA DE
#   SEGURIDAD: sin ella nadie puede actualizar la app ya instalada (habria que desinstalarla).
# - Compila en ~/src/ikigai-apk porque el disco del proyecto (NTFS) no permite ejecutar binarios.
# Resultado: landing/downloads/ikigai-training.apk, landing/app.json y deploy/assetlinks.json.
set -euo pipefail

HOST="${1:?Uso: apk/build-apk.sh app.tudominio.com [versionName] [versionCode]}"
VERSION_NAME="${2:-1.0.0}"
VERSION_CODE="${3:-1}"
APP_URL="${APP_URL:-https://$HOST}"

REPO="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${IKIGAI_APK_WORK:-$HOME/src/ikigai-apk}"
SIGN_DIR="$HOME/.ikigai-signing"
KEYSTORE="$SIGN_DIR/ikigai.keystore"
export JAVA_HOME="${JAVA_HOME:-$HOME/Android/jdk}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/sdk}"
# Bubblewrap exige el diseno antiguo del SDK (carpeta tools/bin) y build-tools 36.1.0: SDK-envoltorio con enlaces.
BW_SDK="$WORK/sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
BT="$ANDROID_HOME/build-tools/36.1.0"
[ -d "$BT" ] || { echo "Falta: sdkmanager \"build-tools;36.1.0\" \"platforms;android-36\"" >&2; exit 1; }
mkdir -p "$BW_SDK/bin"
for d in cmdline-tools platforms build-tools platform-tools licenses; do ln -sfn "$ANDROID_HOME/$d" "$BW_SDK/$d"; done
mkdir -p "$HOME/.bubblewrap"
printf '{"jdkPath":"%s","androidSdkPath":"%s"}\n' "$JAVA_HOME" "$BW_SDK" > "$HOME/.bubblewrap/config.json"

umask 077
mkdir -p "$SIGN_DIR"
if [ ! -f "$KEYSTORE" ]; then
  echo ">> Creando la clave de firma en $KEYSTORE (guardala en un lugar seguro)"
  head -c 24 /dev/urandom | base64 | tr -d '/+=' > "$SIGN_DIR/password.txt"
  keytool -genkeypair -v -keystore "$KEYSTORE" -alias ikigai -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$(cat "$SIGN_DIR/password.txt")" -keypass "$(cat "$SIGN_DIR/password.txt")" \
    -dname "CN=Ikigai Training, O=Ikigai Training, C=AR" >/dev/null
fi
PASS="$(cat "$SIGN_DIR/password.txt")"
export BUBBLEWRAP_KEYSTORE_PASSWORD="$PASS" BUBBLEWRAP_KEY_PASSWORD="$PASS"

# Los iconos se bajan de una copia local del repo: asi se puede compilar antes de que el dominio exista.
ICON_PORT=8791
python3 -m http.server "$ICON_PORT" --bind 127.0.0.1 --directory "$REPO" >/dev/null 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT
sleep 1

# Si el dominio todavia no responde se compila una APK de PRUEBA (manifiesto local): sirve para instalarla en un
# emulador o telefono y verificar el empaquetado, pero no se publica ni toca landing/ ni assetlinks.json.
if curl -fsS --max-time 10 -o /dev/null "https://$HOST/manifest.webmanifest" 2>/dev/null; then
  MODO=publicacion; MANIFEST_URL="https://$HOST/manifest.webmanifest"
else
  MODO=prueba; MANIFEST_URL="http://127.0.0.1:$ICON_PORT/manifest.webmanifest"
  echo ">> https://$HOST no responde: se compila una APK de PRUEBA (no se publica)"
fi

mkdir -p "$WORK/build"
sed -e "s#__HOST__#$HOST#g" -e "s#__ICON_BASE__#http://127.0.0.1:$ICON_PORT#g" -e "s#__KEYSTORE__#$KEYSTORE#g" \
    -e "s#__MANIFEST_URL__#$MANIFEST_URL#g" -e "s#__VERSION_NAME__#$VERSION_NAME#g" -e "s#__VERSION_CODE__#$VERSION_CODE#g" \
    "$REPO/apk/twa-manifest.template.json" > "$WORK/build/twa-manifest.json"

cd "$WORK/build"
BW="$WORK/node_modules/.bin/bubblewrap"
# Genera el proyecto Android desde twa-manifest.json (sin preguntas) y luego compila y firma.
"$BW" update --skipVersionUpgrade --manifest=./twa-manifest.json </dev/null
"$BW" build --skipPwaValidation </dev/null

APK="$WORK/build/app-release-signed.apk"
[ -f "$APK" ] || { echo "No se genero la APK" >&2; exit 1; }
"$BT/apksigner" verify --verbose "$APK" | head -3

if [ "$MODO" = prueba ]; then
  cp "$APK" "$WORK/ikigai-training-PRUEBA.apk"
  echo; echo "APK de PRUEBA: $WORK/ikigai-training-PRUEBA.apk"
  echo "SHA-256: $(sha256sum "$APK" | cut -d' ' -f1)"
  exit 0
fi

mkdir -p "$REPO/landing/downloads"
cp "$APK" "$REPO/landing/downloads/ikigai-training.apk"
SHA="$(sha256sum "$APK" | cut -d' ' -f1)"
SIZE="$(python3 -c "import os,sys;print(round(os.path.getsize(sys.argv[1])/1048576,1))" "$APK")"
FPR="$(keytool -list -v -keystore "$KEYSTORE" -alias ikigai -storepass "$PASS" | awk -F'SHA256: ' '/SHA256:/{print $2}')"

python3 - "$REPO" "$APP_URL" "$VERSION_NAME" "$SIZE" "$SHA" "$FPR" <<'PY'
import json, sys, datetime
repo, app_url, version, size, sha, fpr = sys.argv[1:7]
with open(f"{repo}/landing/app.json", "w", encoding="utf-8") as f:
    json.dump({"appUrl": app_url, "apk": {"file": "downloads/ikigai-training.apk", "version": version,
               "sizeMB": float(size), "sha256": sha, "date": datetime.date.today().strftime("%d/%m/%Y")}}, f, indent=2)
    f.write("\n")
with open(f"{repo}/deploy/assetlinks.json", "w", encoding="utf-8") as f:
    json.dump([{"relation": ["delegate_permission/common.handle_all_urls"],
                "target": {"namespace": "android_app", "package_name": "ar.com.ikigaitraining.app",
                           "sha256_cert_fingerprints": [fpr]}}], f, indent=2)
    f.write("\n")
PY
echo
echo "APK:        landing/downloads/ikigai-training.apk ($SIZE MB)"
echo "SHA-256:    $SHA"
echo "Huella de la clave (para assetlinks): $FPR"
echo "Falta: servir deploy/assetlinks.json en https://$HOST/.well-known/assetlinks.json y subir landing/ a Cloudflare Pages."
