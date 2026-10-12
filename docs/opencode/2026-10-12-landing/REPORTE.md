# Reporte

## Resumen
Se implementó el acceso web a la landing:
- `portalUrl` vacío en `app.json`.
- Botón «Entrar desde el navegador» en `index.html`.
- Lógica en `landing.js` para resolver la URL y mostrar/ocultar el botón.

## Tareas
- Tarea 1: hecha
- Tarea 2: hecha
- Tarea 3: hecha
- Tarea 4: hecha (oráculos OK)

## Decisiones
- Se usó `class="button secondary"` (CSS del portal) y se agregó `class="small-notice"` para la nota bajo el botón.
- La URL del portal se valida con el esquema `https://` por seguridad (igual que `appUrl`).

## Archivos tocados
- `landing/app.json`
- `landing/index.html`
- `landing/landing.js`

## Cómo verificar
- `node --check landing/landing.js`
- `python3 -I -c "import json;d=json.load(open('landing/app.json',encoding='utf-8'));assert 'portalUrl' in d and d['apk']['version']=='0.9.0'"`
- `grep -q 'id="entrar"' landing/index.html`
- `node scripts/test-api-client.mjs`

## Baseline vs final
- Baseline: 18/18 (test-api-client).
- Final: 18/18 (test-api-client).

## Riesgos
- `app.json` tiene un dominio temporal (trycloudflare). Cuando se defina el dominio real, completar `portalUrl` o regenerar `app.json`.

## Propuestas
- Ninguna.
