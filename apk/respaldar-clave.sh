#!/usr/bin/env bash
# Hace una copia CIFRADA de la clave de firma de la APK (~/.ikigai-signing) para guardarla fuera de esta computadora.
#
#   bash apk/respaldar-clave.sh [carpeta-destino]        # sin argumento: ~/Documentos/Ikigai-respaldo-clave
#
# Por qué importa: si se pierde ikigai.keystore no se puede publicar una actualización que se instale encima de la app
# ya instalada en los teléfonos (habría que desinstalar y volver a instalar, perdiendo los datos locales).
#
# La frase de cifrado la escribís vos cuando el script la pide (no se muestra ni se guarda). SIN LA FRASE LA COPIA NO SE
# PUEDE ABRIR: anotala en un gestor de claves o en papel, en un lugar distinto del archivo. El script comprueba que la
# copia se descifra y que el keystore recuperado es idéntico al original antes de decir que terminó.
# Cifrado: AES-256-CBC con PBKDF2 (SHA-256, 600.000 iteraciones) de OpenSSL.
set -euo pipefail
umask 077

ORIGEN="${IKIGAI_SIGNING_DIR:-$HOME/.ikigai-signing}"
DESTINO="${1:-$HOME/Documentos/Ikigai-respaldo-clave}"
SELLO="$(date +%Y%m%d-%H%M)"
ARCHIVO="$DESTINO/ikigai-clave-firma-$SELLO.tar.gz.enc"

command -v openssl >/dev/null || { echo "Falta openssl." >&2; exit 1; }
[ -f "$ORIGEN/ikigai.keystore" ] || { echo "No encuentro $ORIGEN/ikigai.keystore." >&2; exit 1; }
mkdir -p "$DESTINO"

if [ -t 0 ]; then
  read -rsp "Frase para cifrar la copia (mínimo 12 caracteres): " FRASE; echo
  read -rsp "Repetí la frase: " FRASE2; echo
else
  IFS= read -r FRASE; IFS= read -r FRASE2
fi
[ "${#FRASE}" -ge 12 ] || { echo "La frase es demasiado corta (mínimo 12 caracteres)." >&2; exit 1; }
[ "$FRASE" = "$FRASE2" ] || { echo "Las dos frases no coinciden. No se hizo nada." >&2; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

tar -C "$ORIGEN" -czf "$TMP/clave.tar.gz" .
# La frase viaja por un descriptor de archivo, no por la línea de comandos (no aparece en la lista de procesos).
openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -in "$TMP/clave.tar.gz" -out "$ARCHIVO" -pass fd:3 3<<<"$FRASE"

# Verificación: descifrar la copia y comparar el keystore con el original.
mkdir "$TMP/verif"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in "$ARCHIVO" -pass fd:3 3<<<"$FRASE" | tar -xz -C "$TMP/verif"
ORIG_SHA="$(sha256sum "$ORIGEN/ikigai.keystore" | cut -d' ' -f1)"
COPIA_SHA="$(sha256sum "$TMP/verif/ikigai.keystore" | cut -d' ' -f1)"
[ "$ORIG_SHA" = "$COPIA_SHA" ] || { echo "ERROR: la copia no coincide con el original. Borrá $ARCHIVO y reintentá." >&2; exit 1; }
(cd "$DESTINO" && sha256sum "$(basename "$ARCHIVO")" > "$(basename "$ARCHIVO").sha256")
unset FRASE FRASE2

echo
echo "Copia cifrada creada y verificada:"
echo "  $ARCHIVO"
echo "  tamaño: $(stat -c %s "$ARCHIVO") bytes"
echo "  SHA-256 de la copia: $(cut -d' ' -f1 "$ARCHIVO.sha256")"
echo
echo "Falta lo importante: copiarla FUERA de esta computadora (pendrive, disco externo, Google Drive) y"
echo "guardar la frase en otro lugar. Para restaurar:"
echo "  openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in <archivo.enc> | tar -xz -C ~/.ikigai-signing"
