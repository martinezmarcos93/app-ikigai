# Instructivo de Ikigai

Genera la **guía de administración** (con el capítulo de Accesos en detalle) y las hojas para **profesores** y **miembros**,
en HTML autocontenido y PDF, con **capturas reales** de la app marcadas con círculos amarillos numerados.

| Archivo | Para qué |
| --- | --- |
| `preparar.sh` | Deja un entorno **descartable** listo: base nueva, administrador de Agustin (clave temporal), gimnasio de ejemplo importado con todos sus accesos. |
| `capturas.py` | Recorre la app con Playwright y guarda las capturas en `img/` (39 en la última corrida). |
| `construir.py` | Arma los HTML y PDF en `docs/instructivo/` a partir de `img/`. El texto del instructivo está en este archivo. |

## Regenerar (cuando cambie la interfaz)

Requisitos: API de desarrollo en `:3001` y portal en `:8000` (ver `docs/DEVELOPMENT.md` o el README del servidor) sobre una base
**descartable**, el contenedor `ikigai-pg`, el venv `~/.venvs/ikigai-datos` y un Python con Playwright.

```bash
J=$(bash tools/instructivo/preparar.sh | tail -1)        # imprime la ruta del archivo de accesos
cd tools/instructivo
python capturas.py --accesos "$J"                         # ~3 minutos
python construir.py
```

`capturas.py` sale con error si alguna captura falla; `construir.py` si falta alguna imagen que el texto usa. Si se cambia el nombre de un
botón o una pantalla, hay que actualizar también el texto en `construir.py` (se verificó contra la interfaz el 11/10/2026).

Las capturas usan **datos ficticios** (`tools/datos/ejemplo.py`).
