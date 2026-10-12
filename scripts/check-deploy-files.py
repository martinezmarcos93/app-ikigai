"""Comprueba que la imagen web (deploy/web.Dockerfile) publica todo lo que el portal necesita.

La imagen copia una lista blanca de archivos. Si el portal, las paginas publicas o el service worker
(APP_SHELL, que se precarga con cache.addAll: un solo 404 hace fallar su instalacion) referencian un archivo
que la lista no incluye, en desarrollo todo funciona (se sirve la carpeta entera) y en produccion se rompe.
Sale con 1 si falta algo.
"""
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGINAS = ["index.html", "portal.html", "reset-password.html", "accept-invitation.html"]


def leer(ruta):
    with open(os.path.join(RAIZ, ruta), encoding="utf-8") as f:
        return f.read()


def cubierto(ruta, copiados):
    return any(ruta == c or ruta.startswith(c.rstrip("/") + "/") for c in copiados)


copiados = []
for linea in leer("deploy/web.Dockerfile").splitlines():
    if linea.startswith("COPY ") and "deploy/" not in linea:
        partes = linea.split()[1:-1]  # sin COPY ni destino
        copiados += [p.lstrip("./") for p in partes]

necesarios = {}
for pagina in PAGINAS:
    for ref in re.findall(r'(?:src|href)="(?!https?:|#|mailto:|tel:|data:)([^"]+)"', leer(pagina)):
        necesarios.setdefault(os.path.normpath(ref.split("?")[0].split("#")[0]), f"{pagina}")
shell = re.search(r"APP_SHELL\s*=\s*\[(.*?)\];", leer("sw.js"), re.S).group(1)
for ref in re.findall(r"'\./?([^']*)'", shell):
    if ref:
        necesarios.setdefault(os.path.normpath(ref), "sw.js (APP_SHELL)")

faltan = []
for ruta, origen in sorted(necesarios.items()):
    if not os.path.exists(os.path.join(RAIZ, ruta)):
        faltan.append(f"{ruta}: lo pide {origen} pero no existe en el repositorio")
    elif not cubierto(ruta, copiados):
        faltan.append(f"{ruta}: lo pide {origen} pero deploy/web.Dockerfile no lo copia")
for f in faltan:
    print("FALTA", f)
print(f"{len(necesarios)} archivos requeridos · {len(faltan)} problema(s)")
sys.exit(1 if faltan else 0)
