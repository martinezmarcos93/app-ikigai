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
- **Aviso periódico:** cron cada 12 minutos, lunes a sábado, 08:00 a 19:59 (hora de Buenos Aires), le pega a `/healthz` para que el plan gratis de Render
  (duerme a los 15 min) casi no se duerma en horario de clases. Consume unas 300 de las 750 horas mensuales del plan.
- **Render:** `CORS_ORIGINS=https://app.ikigai-training.com` y `TRUST_PROXY_HOPS=2` (saltos de confianza: la red de Render y la dirección de salida de Cloudflare;
  el cliente es la IP que fija el Worker). Si se cambia la cadena de proxies hay que revisar ese número, porque de él depende el límite de intentos por IP.

- **Tarea diaria de cobros (ADR-003):** cron `0 12 * * *` (09:00 de Buenos Aires, todos los días) → `POST /api/v1/internal/daily` directo a la API
  con la cabecera `x-internal-token`. Requiere el secreto del Worker `INTERNAL_JOB_TOKEN` (mismo valor que en Render):
  `cd deploy/worker && npx wrangler secret put INTERNAL_JOB_TOKEN`. El proxy público responde 404 a `/api/v*/internal/*`.

- **Desafío anti-bots de Render y dirección de respaldo:** el Cloudflare **de Render** (no el nuestro) a veces responde con su pantalla
  «Just a moment...» (`HTTP 429`, cabecera `cf-mitigated: challenge`) en vez de la API, y nadie puede iniciar sesión. Pasó el 07/11 con
  `ikigai-api-q17j.onrender.com` y el 10/11 con `api.ikigai-training.com`. Por eso el Worker conoce dos puertas al mismo servicio
  (`API_ORIGIN` y `API_ORIGIN_FALLBACK`): si una devuelve el desafío o no conecta, reintenta por la otra con el mismo pedido (el cuerpo se
  lee una vez y se reenvía). Un timeout no se reintenta (Render dormido es el mismo servidor en las dos). Si las dos están bloqueadas, el portal
  recibe `503 api_blocked` en JSON en lugar del HTML del desafío. Los crons mandan `User-Agent: IkigaiWorker/1.0` para no parecer tráfico anónimo.

### Cómo enterarse de un bloqueo
- **Logs del Worker** (Cloudflare → Workers → `ikigai-app` → Logs, *observability* activado): buscar `ALERTA api:`. Cada desafío queda anotado
  con la dirección bloqueada; el aviso periódico deja `keepalive /healthz -> 200 via <host>` (o `BLOQUEADO`).
- **Cabecera `x-ikigai-api-route: fallback`** en las respuestas que llegaron por la dirección de respaldo: si aparece, la principal está bloqueada.
- **Monitor externo gratuito** (UptimeRobot o similar), dos monitores cada 5 min con aviso por mail:
  1. `https://app.ikigai-training.com/api/v1/health`, tipo *keyword*, palabra `"status":"ok"` → avisa si los usuarios no pueden entrar (todo bloqueado o caído).
  2. `https://api.ikigai-training.com/api/v1/health`, tipo *HTTP status* → avisa si la dirección principal está bloqueada aunque el respaldo cubra.

## Publicar
**Automático:** cada push a `main` corre `.github/workflows/deploy-worker.yml`: tests del portal y del Worker → si el push toca `server/`,
espera a que Render tenga ese commit arriba (`GET /api/v1/health` → `commit`, que Render define en `RENDER_GIT_COMMIT`; hasta 20 min) → `wrangler deploy`.
Si Render no llega en 20 min (Auto-Deploy apagado o build roto), el portal **no** se publica y el workflow falla en rojo.

Requiere dos secretos del repositorio (una sola vez, GitHub → Settings → Secrets and variables → Actions):

| Secreto | De dónde sale |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens → Create Token → plantilla «Edit Cloudflare Workers» (cuenta de Marcos, zona `ikigai-training.com`). |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare → Workers y Pages → columna derecha «Account ID». |

Con `gh`: `gh secret set CLOUDFLARE_API_TOKEN -R martinezmarcos93/app-ikigai` (pide el valor sin dejarlo en el historial).

**Manual** (respaldo, o para publicar sin pasar por GitHub):
```
bash deploy/worker/publicar.sh      # corre los tests, arma public/ y hace wrangler deploy
```
Si al publicar falla el alta del dominio personalizado: Cloudflare → Workers y Pages → `ikigai-app` → Settings → Domains & Routes → Add → Custom domain → `app.ikigai-training.com`.

## Probar sin publicar
`cd deploy/worker && node build.mjs && ~/src/ikigai-deploy/node_modules/.bin/wrangler dev --local --port 8799` y abrir `http://127.0.0.1:8799/portal.html`.
Tests: `node --test deploy/worker/test/worker.test.mjs`.
