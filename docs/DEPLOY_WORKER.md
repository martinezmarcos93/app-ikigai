# Portal en `app.ikigai-training.com` (Cloudflare Worker)

El portal está hecho para vivir bajo **el mismo origen** que la API (cookie de sesión `SameSite=Strict`, sin CORS). Con la API en Render y el
portal en Cloudflare, el Worker de `deploy/worker/` junta las dos cosas bajo `https://app.ikigai-training.com`:

| Ruta | Quién la atiende |
| --- | --- |
| `/api/*`, `/healthz` | El Worker las reenvía a `API_ORIGIN` (Render). La IP del cliente la fija el Worker en `X-Forwarded-For` (se descarta la que mande el navegador). |
| todo lo demás | Archivos estáticos de `deploy/worker/public/` (sin costo por pedido, siempre despiertos), con las mismas cabeceras que `deploy/Caddyfile`. |
| `/` | Redirige a `/portal.html`. |

- **Lista blanca:** `build.mjs` arma `public/` leyendo los `COPY … /srv/…` de `deploy/web.Dockerfile`: el Worker nunca publica algo que Docker no publicaría
  (nada de `demo.html`, `app.js`, `server/`, `docs/`).
- **Rutas literales** (`html_handling: none`): `/portal.html` no se redirige a `/portal`; el service worker y la APK usan `/portal.html`.
- **Servidor dormido:** si Render tarda más de 85 s responde `503 server_waking_up` (JSON, `Retry-After: 15`).
- **Aviso periódico:** cron cada 10 minutos, lunes a sábado, 08:00 a 19:59 (hora de Buenos Aires), le pega a `/healthz` para que el plan gratis de Render
  (duerme a los 15 min) casi no se duerma en horario de clases. Consume unas 300 de las 750 horas mensuales del plan.
- **Render:** `CORS_ORIGINS=https://app.ikigai-training.com` y `TRUST_PROXY_HOPS=2` (saltos de confianza: la red de Render y la dirección de salida de Cloudflare;
  el cliente es la IP que fija el Worker). Si se cambia la cadena de proxies hay que revisar ese número, porque de él depende el límite de intentos por IP.

## Publicar
```
bash deploy/worker/publicar.sh      # corre los tests, arma public/ y hace wrangler deploy
```
Si al publicar falla el alta del dominio personalizado: Cloudflare → Workers y Pages → `ikigai-app` → Settings → Domains & Routes → Add → Custom domain → `app.ikigai-training.com`.

## Probar sin publicar
`cd deploy/worker && node build.mjs && ~/src/ikigai-deploy/node_modules/.bin/wrangler dev --local --port 8799` y abrir `http://127.0.0.1:8799/portal.html`.
Tests: `node --test deploy/worker/test/worker.test.mjs`.
