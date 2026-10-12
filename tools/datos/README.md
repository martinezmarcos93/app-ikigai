# Carga de datos del gimnasio

Herramientas para pasar los datos reales del gimnasio al sistema **sin tipear nada a mano**, y para entregar los accesos
(usuario y clave) a profesores y miembros.

| Archivo | Para qué |
| --- | --- |
| `plantillas/Planilla-Ikigai-VACIA.xlsx` | La planilla que se le manda al dueño para completar. |
| `plantillas/Planilla-Ikigai-EJEMPLO.xlsx` | La misma, con un gimnasio inventado, para mostrar cómo se completa y para probar. |
| `generar_planilla.py` | Regenera las dos planillas (si cambian las columnas). |
| `importar_datos.py` | Valida la planilla y la carga en el sistema a través de su API. |
| `esquema.py` | Definición única de hojas y columnas (la usan los dos scripts). |
| `test_importador.py` | Pruebas del validador. |

## Instalación (una vez)

```bash
python3 -m venv ~/.venvs/ikigai-datos
~/.venvs/ikigai-datos/bin/pip install -r tools/datos/requirements-datos.txt     # openpyxl 3.1.5 + defusedxml 0.7.1
```

Las dos dependencias se auditaron antes de sumarlas (licencias MIT y PSF, sin vulnerabilidades conocidas en OSV, sin código al
instalar). Solo las usan estas herramientas, nunca el servidor.

## El proceso, paso a paso

1. **Mandarle al dueño** `Planilla-Ikigai-VACIA.xlsx` y el cuestionario (`docs/entrega/`).
2. **Recibir la planilla completada** y guardarla **fuera del repositorio** (tiene datos personales): por ejemplo en `~/Ikigai-datos/`.
3. **Validar** (no toca nada; lista cada error con hoja y fila):
   ```bash
   ~/.venvs/ikigai-datos/bin/python tools/datos/importar_datos.py ~/Ikigai-datos/PlanillaCompleta.xlsx
   ```
   Corregir la planilla con el dueño hasta que diga «Sin errores».
4. **Ver el plan contra el sistema** (tampoco escribe). Necesita la dirección del sistema y la cuenta de administración (que ya
   debe haber cambiado su clave temporal):
   ```bash
   ~/.venvs/ikigai-datos/bin/python tools/datos/importar_datos.py ~/Ikigai-datos/PlanillaCompleta.xlsx \
       --url https://app.dominio.com.ar --usuario correo@dueño
   ```
5. **Aplicar**, creando de paso los accesos y las clases de las próximas 4 semanas:
   ```bash
   ~/.venvs/ikigai-datos/bin/python tools/datos/importar_datos.py ~/Ikigai-datos/PlanillaCompleta.xlsx \
       --url https://app.dominio.com.ar --usuario correo@dueño --aplicar --crear-accesos --generar-clases 28
   ```
   Pide escribir `SI` antes de cargar (`--si` lo omite). **Se puede repetir**: lo que ya existe se omite, no se duplica.
6. **Entregar los accesos.** El paso anterior deja en `~/Ikigai-accesos/` (carpeta `700`) una **hoja imprimible** con una tarjeta por
   persona (usuario y clave temporal). Imprimir, recortar, entregar **en mano** y **borrar el archivo** y la planilla.
   Si se interrumpe, las claves ya creadas están en `accesos-AAAAMMDD-HHMM.jsonl`; la hoja se regenera con
   `importar_datos.py --hoja-desde ese-archivo.jsonl --url https://…`.

Cada persona entra con su usuario y la clave temporal y el sistema le pide elegir la propia (mínimo 12 caracteres).

## Qué hace y qué no hace

- **Valida todo antes de escribir**: campos obligatorios, correos, fechas (`dd/mm/aaaa`), horas, importes (acepta `28.000`,
  `28000,50`, `$ 28.000`), días, estados, DNI repetidos, nombres repetidos sin DNI, referencias entre hojas (el servicio, el profesor
  o el miembro de una fila tienen que existir en su hoja) y que cada turno fijo corresponda a un horario.
- **Reutiliza las reglas de la API** (no escribe directo en la base): todo queda auditado y respeta los controles del sistema.
- **Accesos**: crea cuenta a los profesores y a los miembros **Activos, En prueba y Deudor**; no a Suspendidos ni de Baja.
- **No pisa datos existentes**: si un servicio, profesor, miembro, horario o membresía ya existe, lo omite (no actualiza). Para
  corregir algo ya cargado se usa el portal.
- Los **saldos iniciales** se registran como ajustes con una clave de idempotencia derivada del contenido: repetir no duplica.
- El límite de velocidad de la API (por ejemplo 20 accesos nuevos por minuto) se respeta solo: el script espera y sigue.

## Privacidad

La planilla y las hojas de accesos contienen datos personales y claves. Guardarlas fuera del repo (`.gitignore` ya excluye
`*.xlsx` que no sean las plantillas, ver abajo), no enviarlas por canales abiertos y **borrarlas** cuando termine la carga.
