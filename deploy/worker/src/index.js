// Proxy hacia la API de Render + aviso periodico para que no se duerma. Sin dependencias.

const METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
// Cabeceras que el cliente no debe poder fijar hacia la API (la IP real la pone el Worker) o que no tienen sentido reenviar.
// accept-encoding: la API responde sin comprimir y Cloudflare comprime hacia el navegador; asi no se mezclan dos compresiones.
const REQUEST_DROP = ["accept-encoding", "host", "connection", "forwarded", "x-real-ip", "x-forwarded-host", "x-forwarded-proto", "cf-connecting-ip", "cf-ipcountry", "cf-ray", "cf-visitor", "true-client-ip"];
const RESPONSE_DROP = ["server", "rndr-id", "x-render-origin-server", "x-powered-by"];
const DEFAULT_TIMEOUT_MS = 85_000; // Render tarda ~50 s en despertar; Cloudflare corta a los ~100 s.

export function isApiPath(pathname) {
  return pathname === "/healthz" || pathname.startsWith("/api/");
}

// La tarea diaria de cobros (/api/v1/internal/*) solo la llama el cron de este Worker, directo a la API.
// Desde internet no se reenvia, aunque venga disfrazada (%69nternal, barras dobles, mayusculas): la API decodifica igual.
export function isInternalPath(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return true; }
  return /^\/api\/v\d+\/internal(\/|$)/i.test(decoded.replace(/\/{2,}/g, "/"));
}

export const DAILY_CRON = "0 12 * * *"; // 09:00 de Buenos Aires, todos los dias

function unavailable(status, error, message) {
  return new Response(JSON.stringify({ error, message }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "retry-after": "15" }
  });
}

// Pedidos que arma el propio Worker (crons): se identifican siempre igual para no parecer trafico anonimo.
export const WORKER_UA = "IkigaiWorker/1.0 (+https://app.ikigai-training.com)";

/** El Cloudflare de Render puede responder con su pantalla anti-bots ("Just a moment...") en vez de la API. */
export function isChallenge(response) {
  return (response.headers.get("cf-mitigated") || "").toLowerCase() === "challenge";
}

/** Errores del propio Cloudflare cuando no llega al destino (520-530, p. ej. 530 = DNS del origen): para el Worker es "no conecta". */
export function isEdgeError(response) {
  return response.status >= 520 && response.status <= 530;
}

/** Direcciones de la API en orden: la principal y, si esta configurada, la de respaldo (otra puerta al mismo servicio de Render). */
export function apiOrigins(env) {
  return [env.API_ORIGIN, env.API_ORIGIN_FALLBACK].filter((o, i, all) => o && all.indexOf(o) === i);
}

/**
 * Pide `path` a la API probando cada direccion en orden. Pasa a la siguiente si la actual
 * responde con el desafio anti-bots, no se puede conectar o Cloudflare devuelve 520-530. Un timeout NO se reintenta:
 * significa que Render se esta despertando, y la otra direccion llega al mismo servidor dormido.
 * Devuelve { response, origin, fallback } o lanza el error de la ultima direccion.
 */
export async function fetchApi(env, path, makeInit, fetchImpl = fetch, log = console) {
  const origins = apiOrigins(env);
  let lastError;
  let challenged;
  for (let i = 0; i < origins.length; i++) {
    const origin = origins[i];
    const isLast = i === origins.length - 1;
    let response;
    try {
      response = await fetchImpl(new URL(path, origin), makeInit());
    } catch (error) {
      if (error && (error.name === "TimeoutError" || error.name === "AbortError")) throw error;
      log.error(`api: no se pudo conectar con ${new URL(origin).host} (${error && error.name})${isLast ? "" : "; pruebo la direccion de respaldo"}`);
      lastError = error;
      continue;
    }
    if (isEdgeError(response)) {
      await response.body?.cancel().catch(() => {});
      log.error(`api: Cloudflare no llega a ${new URL(origin).host} (HTTP ${response.status})${isLast ? "" : "; pruebo la direccion de respaldo"}`);
      lastError = new TypeError(`edge ${response.status}`);
      continue;
    }
    if (isChallenge(response)) {
      log.error(`ALERTA api: desafio anti-bots de Cloudflare en ${new URL(origin).host} (HTTP ${response.status})${isLast ? "" : "; pruebo la direccion de respaldo"}`);
      if (!isLast) { await response.body?.cancel().catch(() => {}); continue; }
      challenged = response;
      break;
    }
    return { response, origin, fallback: i > 0 };
  }
  if (challenged) return { response: challenged, origin: origins.at(-1), fallback: origins.length > 1, challenged: true };
  throw lastError || new TypeError("sin direcciones de API configuradas");
}

export async function proxyToApi(request, env, fetchImpl = fetch, log = console) {
  if (!METHODS.has(request.method)) return unavailable(405, "method_not_allowed", "Método no permitido.");
  const url = new URL(request.url);
  if (isInternalPath(url.pathname)) {
    return new Response(JSON.stringify({ error: "not_found", message: "The requested resource was not found." }), {
      status: 404, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
    });
  }
  const headers = new Headers(request.headers);
  for (const name of REQUEST_DROP) headers.delete(name);
  // La IP del cliente la declara el Worker (no el navegador): el servidor cuenta los saltos de proxy de confianza.
  headers.set("x-forwarded-for", request.headers.get("cf-connecting-ip") || "");
  headers.set("x-forwarded-proto", "https");
  // El cuerpo se lee una vez para poder reenviarlo si hay que pasar a la direccion de respaldo (son JSON chicos).
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const body = hasBody ? await request.arrayBuffer() : undefined;
  const makeInit = () => ({
    method: request.method,
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(Number(env.TIMEOUT_MS) || DEFAULT_TIMEOUT_MS),
    ...(hasBody ? { body } : {})
  });
  // El origen sale de la configuracion; del pedido solo se toma la ruta (siempre empieza con /api/ o es /healthz).
  let result;
  try {
    result = await fetchApi(env, url.pathname + url.search, makeInit, fetchImpl, log);
  } catch (error) {
    const timedOut = error && (error.name === "TimeoutError" || error.name === "AbortError");
    return timedOut
      ? unavailable(503, "server_waking_up", "El servidor se está despertando. Probá de nuevo en unos segundos.")
      : unavailable(502, "upstream_unreachable", "No se pudo conectar con el servidor. Probá de nuevo en un momento.");
  }
  if (result.challenged) {
    // Todas las direcciones bloqueadas: el portal recibe JSON entendible en vez de la pagina HTML del desafio.
    await result.response.body?.cancel().catch(() => {});
    return unavailable(503, "api_blocked", "El servidor está bloqueado momentáneamente por su proveedor. Probá de nuevo en unos minutos.");
  }
  const upstream = result.response;
  const out = new Headers(upstream.headers);
  for (const name of RESPONSE_DROP) out.delete(name);
  // Marca visible para monitoreo: la respuesta llego por la direccion de respaldo.
  if (result.fallback) out.set("x-ikigai-api-route", "fallback");
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out });
}

export async function wakeApi(env, fetchImpl = fetch, log = console) {
  try {
    const { response, challenged, origin } = await fetchApi(env, "/healthz", () => ({
      headers: { "user-agent": WORKER_UA },
      signal: AbortSignal.timeout(Number(env.TIMEOUT_MS) || DEFAULT_TIMEOUT_MS)
    }), fetchImpl, log);
    await response.body?.cancel().catch(() => {});
    log.log(`keepalive /healthz -> ${response.status} via ${new URL(origin).host}${challenged ? " (BLOQUEADO)" : ""}`);
    return challenged ? 0 : response.status;
  } catch (error) {
    log.error("keepalive fallo:", error && error.name);
    return 0;
  }
}

/** Tarea diaria de cobros (recordatorios y propuestas de recargo). Idempotente: si se repite no duplica nada. */
export async function runDaily(env, fetchImpl = fetch, log = console) {
  if (!env.INTERNAL_JOB_TOKEN) { log.error("tarea diaria: falta el secreto INTERNAL_JOB_TOKEN"); return 0; }
  try {
    const { response, challenged } = await fetchApi(env, "/api/v1/internal/daily", () => ({
      method: "POST",
      headers: { "x-internal-token": env.INTERNAL_JOB_TOKEN, "user-agent": WORKER_UA },
      signal: AbortSignal.timeout(Number(env.TIMEOUT_MS) || DEFAULT_TIMEOUT_MS)
    }), fetchImpl, log);
    if (challenged) { await response.body?.cancel().catch(() => {}); log.error("tarea diaria: API bloqueada en todas las direcciones"); return 0; }
    log.log(`tarea diaria -> ${response.status} ${await response.text().catch(() => "")}`);
    return response.status;
  } catch (error) {
    log.error("tarea diaria fallo:", error && error.name);
    return 0;
  }
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    // run_worker_first manda aca solo la API; si una ruta de assets llegara igual, se sirve como asset.
    return isApiPath(pathname) ? proxyToApi(request, env) : env.ASSETS.fetch(request);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(event.cron === DAILY_CRON ? runDaily(env) : wakeApi(env));
  }
};
